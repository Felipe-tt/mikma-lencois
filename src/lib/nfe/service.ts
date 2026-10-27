import * as Sentry from '@sentry/nextjs';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { nfeConfigFrom, type NfeEnvironment } from './config';
import { buildNfePayload, NfeDataError, type NfeOrder } from './payload';
import type { NfeRecord, NfeStatus } from './types';
import { focusCancel, focusEmit, focusFileUrl, focusGet, FocusConfigError, focusErrorMessage, type FocusNfe } from './focusApi';

/**
 * Ciclo de vida da NF-e de um pedido. A nota de produção fica em
 * `order.nfe` e a de teste (homologação) em `order.nfeTeste`, então dá para
 * testar em qualquer pedido sem mexer na nota real.
 *
 * Regra de ouro: nunca duas notas autorizadas para o mesmo pedido. Por isso
 * a referência (`ref`) só muda depois de a Focus confirmar que a anterior foi
 * rejeitada ou cancelada. Falha de rede mantém a mesma ref, e a consulta
 * seguinte descobre se a nota chegou.
 */

export type { NfeStatus, NfeRecord } from './types';

export class NfeError extends Error {
  constructor(message: string, public readonly httpStatus = 400) { super(message); }
}

export const nfeField = (env: NfeEnvironment) => (env === 'producao' ? 'nfe' : 'nfeTeste');

const PAID_STATUSES = new Set(['paid', 'preparing', 'shipped', 'delivered']);
// A SEFAZ só deixa cancelar a NF-e até 24h depois da autorização.
export const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;
// Sem resposta da Focus por este tempo: reenvia com a mesma ref.
const RESEND_AFTER_MS = 2 * 60 * 1000;

const orderRef = (orderId: string) => adminDb.collection('orders').doc(orderId);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function writeRecord(orderId: string, env: NfeEnvironment, patch: Partial<NfeRecord>) {
  const field = nfeField(env);
  const update: Record<string, unknown> = { [`${field}.updatedAt`]: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) update[`${field}.${k}`] = v === undefined ? FieldValue.delete() : v;
  await orderRef(orderId).update(update);
}

async function loadCustomer(order: FirebaseFirestore.DocumentData) {
  const uid = order.userId as string | undefined;
  const user = uid ? (await adminDb.collection('users').doc(uid).get()).data() ?? {} : {};
  let email = (user.email as string | undefined) || (order.customerEmail as string | undefined);
  if (!email && uid) email = await adminAuth.getUser(uid).then(u => u.email, () => undefined);
  return {
    name: String(user.name ?? user.displayName ?? order.customerName ?? ''),
    cpf: String(user.cpf ?? ''),
    email,
    phone: user.phone as string | undefined,
  };
}

/** Aplica no pedido o estado que a Focus devolveu. */
async function applyFocusState(orderId: string, env: NfeEnvironment, data: FocusNfe, current?: NfeRecord): Promise<NfeStatus> {
  const now = new Date().toISOString();
  switch (data.status) {
    case 'autorizado':
      await writeRecord(orderId, env, {
        status: 'autorizada',
        numero: data.numero, serie: data.serie, chave: data.chave_nfe,
        danfeUrl: focusFileUrl(env, data.caminho_danfe),
        xmlUrl: focusFileUrl(env, data.caminho_xml_nota_fiscal),
        authorizedAt: current?.authorizedAt ?? now,
        mensagem: null,
      });
      return 'autorizada';
    case 'cancelado':
      await writeRecord(orderId, env, { status: 'cancelada', cancelledAt: current?.cancelledAt ?? now, mensagem: null });
      return 'cancelada';
    case 'erro_autorizacao':
    case 'denegado': {
      const mensagem = `${data.status === 'denegado' ? 'Nota denegada pela SEFAZ' : 'Rejeitada pela SEFAZ'}: ${focusErrorMessage(data) || 'sem detalhes'}`;
      await writeRecord(orderId, env, { status: 'erro', mensagem });
      await notifyError(orderId, env, mensagem);
      return 'erro';
    }
    default:
      await writeRecord(orderId, env, { status: 'processando', mensagem: null });
      return 'processando';
  }
}

async function notifyError(orderId: string, env: NfeEnvironment, mensagem: string) {
  if (env !== 'producao') return;
  Sentry.captureMessage('nfe: nota não emitida', { level: 'warning', extra: { orderId, mensagem } });
  await adminDb.collection('notifications').doc('seller').collection('items').doc().set({
    type: 'nfe_error',
    orderId,
    message: `Nota fiscal do pedido #${orderId.slice(-8).toUpperCase()} não saiu: ${mensagem.slice(0, 300)}`,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  }).catch(() => {});
}

/** Monta e envia a nota da ref atual. Erros de dados e de configuração ficam registrados no pedido. */
async function send(orderId: string, env: NfeEnvironment, rec: NfeRecord): Promise<NfeStatus> {
  const snap = await orderRef(orderId).get();
  const order = snap.data()!;
  const config = nfeConfigFrom(await getSettings() as unknown as Record<string, unknown>);
  let payload: Record<string, unknown>;
  try {
    payload = buildNfePayload({ id: orderId, ...order } as NfeOrder, await loadCustomer(order), config, { homologacao: env === 'homologacao' });
  } catch (err) {
    if (!(err instanceof NfeDataError)) throw err;
    const mensagem = `Faltam dados: ${err.problems.join('; ')}`;
    await writeRecord(orderId, env, { status: 'pendente_dados', mensagem });
    await notifyError(orderId, env, mensagem);
    return 'pendente_dados';
  }

  let res;
  try {
    res = await focusEmit(env, rec.ref, payload);
  } catch (err) {
    if (!(err instanceof FocusConfigError)) throw err;
    await writeRecord(orderId, env, { status: 'erro', mensagem: err.message });
    return 'erro';
  }
  if (res.ok) return applyFocusState(orderId, env, res.data, rec);
  if (res.status === 0 || res.status >= 500 || res.status === 429) {
    // Pode ter chegado. Fica "processando"; a consulta decide depois.
    await writeRecord(orderId, env, { status: 'processando', mensagem: `Focus sem resposta (${res.error}); conferindo de novo em instantes` });
    return 'processando';
  }
  // 4xx: se a ref já existe na Focus (reenvio), vale o estado de lá.
  const existing = await focusGet(env, rec.ref);
  if (existing.ok && existing.data.status) return applyFocusState(orderId, env, existing.data, rec);
  const mensagem = `Focus recusou a nota: ${res.error}`;
  await writeRecord(orderId, env, { status: 'erro', mensagem });
  await notifyError(orderId, env, mensagem);
  return 'erro';
}

/**
 * Emite a nota do pedido (ou continua uma emissão em andamento). Seguro para
 * chamar quantas vezes for: nota autorizada não é reemitida.
 */
export async function issueNfe(orderId: string, env: NfeEnvironment, opts: { by?: string; waitMs?: number } = {}): Promise<NfeStatus> {
  const field = nfeField(env);
  const claim = await adminDb.runTransaction(async (tx): Promise<{ rec: NfeRecord; resume: boolean } | NfeStatus> => {
    const snap = await tx.get(orderRef(orderId));
    if (!snap.exists) throw new NfeError('Pedido não encontrado', 404);
    const order = snap.data()!;
    if (env === 'producao' && !PAID_STATUSES.has(order.status as string)) {
      throw new NfeError('A nota de produção só sai para pedido pago e não cancelado.');
    }
    const rec = order[field] as NfeRecord | undefined;
    if (rec?.status === 'autorizada') return 'autorizada';
    if (rec?.status === 'processando') return { rec, resume: true };
    const now = new Date().toISOString();
    // Nova ref só depois de rejeição ou cancelamento confirmados pela Focus.
    const attempt = !rec ? 1 : rec.status === 'erro' || rec.status === 'cancelada' ? rec.attempt + 1 : rec.attempt;
    const next: NfeRecord = {
      ref: attempt === 1 ? orderId : `${orderId}-${attempt}`,
      environment: env, status: 'processando', attempt,
      requestedAt: now, updatedAt: now, mensagem: null,
      ...(opts.by ? { by: opts.by } : {}),
    };
    tx.update(orderRef(orderId), { [field]: next });
    return { rec: next, resume: false };
  });
  if (typeof claim === 'string') return claim;

  let status: NfeStatus = (claim.resume ? await syncNfe(orderId, env) : await send(orderId, env, claim.rec)) ?? 'processando';
  if (status === 'processando' && opts.waitMs) {
    // A SEFAZ costuma responder em poucos segundos.
    await sleep(opts.waitMs);
    status = (await syncNfe(orderId, env)) ?? status;
  }
  return status;
}

/** Consulta a Focus e atualiza o pedido. Reenvia se a nota nunca chegou lá. */
export async function syncNfe(orderId: string, env: NfeEnvironment): Promise<NfeStatus | null> {
  const rec = (await orderRef(orderId).get()).get(nfeField(env)) as NfeRecord | undefined;
  if (!rec) return null;
  let res;
  try {
    res = await focusGet(env, rec.ref);
  } catch (err) {
    if (err instanceof FocusConfigError) return rec.status;
    throw err;
  }
  if (res.ok && res.data.status) return applyFocusState(orderId, env, res.data, rec);
  if (res.status === 404 && rec.status === 'processando' && Date.now() - Date.parse(rec.requestedAt) > RESEND_AFTER_MS) {
    return send(orderId, env, rec);
  }
  return rec.status;
}

/** Cancela a nota autorizada (até 24h depois da autorização). */
export async function cancelNfe(orderId: string, env: NfeEnvironment, justificativa: string): Promise<NfeStatus> {
  const text = justificativa.replace(/\s+/g, ' ').trim();
  if (text.length < 15 || text.length > 255) throw new NfeError('A justificativa precisa ter entre 15 e 255 caracteres.');
  const rec = (await orderRef(orderId).get()).get(nfeField(env)) as NfeRecord | undefined;
  if (!rec || rec.status !== 'autorizada') throw new NfeError('Não há nota autorizada para cancelar.');
  if (rec.authorizedAt && Date.now() - Date.parse(rec.authorizedAt) > CANCEL_WINDOW_MS) {
    throw new NfeError('Passou o prazo de 24h para cancelar a nota. Emita uma nota de devolução no emissor.');
  }
  const res = await focusCancel(env, rec.ref, text);
  if (res.ok && res.data.status === 'cancelado') return applyFocusState(orderId, env, res.data, rec);
  const mensagem = focusErrorMessage(res.data) || (res.ok ? 'cancelamento não confirmado' : res.error);
  await writeRecord(orderId, env, { mensagem: `Cancelamento recusado: ${mensagem}` });
  throw new NfeError(`A SEFAZ não cancelou a nota: ${mensagem}`, 502);
}

/**
 * Pedido cancelado com nota de produção autorizada: cancela a nota dentro do
 * prazo, senão avisa que precisa de nota de devolução. Nunca lança.
 */
export async function handleNfeOnOrderCancel(orderId: string): Promise<void> {
  try {
    const rec = (await orderRef(orderId).get()).get('nfe') as NfeRecord | undefined;
    if (!rec || rec.status !== 'autorizada') return;
    const withinWindow = !rec.authorizedAt || Date.now() - Date.parse(rec.authorizedAt) <= CANCEL_WINDOW_MS;
    if (withinWindow) {
      try {
        await cancelNfe(orderId, 'producao', 'Venda cancelada antes da entrega da mercadoria');
        return;
      } catch (err) {
        console.warn(`[nfe] cancelamento automático falhou (${orderId}):`, err);
      }
    }
    await adminDb.collection('notifications').doc('seller').collection('items').doc().set({
      type: 'nfe_error',
      orderId,
      message: `Pedido #${orderId.slice(-8).toUpperCase()} cancelado com nota fiscal ${rec.numero ?? ''} ainda válida. ${withinWindow ? 'Cancele a nota no painel do pedido.' : 'Passou o prazo de cancelamento: emita uma nota de devolução.'}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`[nfe] handleNfeOnOrderCancel falhou (${orderId}):`, err);
  }
}

/** Emissão automática depois do pagamento, se ligada no painel. Nunca lança. */
export async function autoIssueNfe(orderId: string): Promise<void> {
  try {
    const config = nfeConfigFrom(await getSettings() as unknown as Record<string, unknown>);
    if (!config.autoEmit) return;
    await issueNfe(orderId, config.environment, { by: 'auto' });
  } catch (err) {
    console.error(`[nfe] emissão automática falhou (${orderId}):`, err);
    Sentry.captureException(err, { tags: { area: 'nfe' }, extra: { orderId } });
  }
}
