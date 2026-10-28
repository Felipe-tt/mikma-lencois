import * as Sentry from '@sentry/nextjs';
import { createHmac, timingSafeEqual } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { nfeConfigFrom, type NfeConfig, type NfeEnvironment } from './config';
import { brasiliaIso, buildNfe, chaveAcesso, nfeProblems, randomCNF, UF_CODE, type NfeOrder } from './payload';
import { loadCertificate } from './certificate';
import { ibgeFromCep } from './ibge';
import { authorize, cancel, consult, inutilizar, type SefazCert } from './sefaz';
import type { NfeRecord, NfeStatus } from './types';

export type { NfeStatus, NfeRecord } from './types';

/**
 * Ciclo de vida da NF-e de um pedido, emitida direto na SEFAZ com o
 * certificado A1 da loja (sem serviço pago). A nota de produção fica em
 * `order.nfe` e a de teste (homologação) em `order.nfeTeste`.
 *
 * Garantias:
 * - Sem certificado importado, nada é gerado.
 * - Nunca duas notas para o mesmo pedido: número, série, código e data de
 *   emissão ficam gravados antes do envio, e sem resposta da SEFAZ a nota é
 *   CONSULTADA pela chave antes de qualquer reenvio.
 * - Numeração sequencial por transação (secureConfig/nfeNumeracao).
 * - Rejeitada: a nova tentativa reusa o mesmo número. Pedido cancelado com
 *   número usado e sem nota: o número é inutilizado.
 */

export class NfeError extends Error {
  constructor(message: string, public readonly httpStatus = 400) { super(message); }
}

export const nfeField = (env: NfeEnvironment) => (env === 'producao' ? 'nfe' : 'nfeTeste');

const PAID_STATUSES = new Set(['paid', 'preparing', 'shipped', 'delivered']);
// A SEFAZ só deixa cancelar a NF-e até 24h depois da autorização.
export const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;
// Sem resposta da SEFAZ por este tempo e a nota não consta lá: reenvia.
const RESEND_AFTER_MS = 2 * 60 * 1000;
const NO_CERT = 'Importe o certificado digital A1 em Configurações > Nota fiscal para emitir notas.';

const orderRef = (orderId: string) => adminDb.collection('orders').doc(orderId);
const docsRef = (orderId: string, chave: string) => orderRef(orderId).collection('nfeDocs').doc(chave);
const counterRef = () => adminDb.collection('secureConfig').doc('nfeNumeracao');

/** Assinatura do link público da DANFE/XML de um pedido. */
export function nfeDocToken(orderId: string, env: NfeEnvironment): string {
  const secret = process.env.STAFF_SESSION_SECRET ?? '';
  return createHmac('sha256', secret).update(`nfe-doc:${orderId}:${env}`).digest('base64url').slice(0, 32);
}
export function checkDocToken(orderId: string, env: NfeEnvironment, token: string): boolean {
  const expected = Buffer.from(nfeDocToken(orderId, env));
  const got = Buffer.from(token);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

async function writeRecord(orderId: string, env: NfeEnvironment, patch: Partial<NfeRecord>) {
  const field = nfeField(env);
  const update: Record<string, unknown> = { [`${field}.updatedAt`]: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) update[`${field}.${k}`] = v === undefined ? FieldValue.delete() : v;
  await orderRef(orderId).update(update);
}

async function notify(orderId: string, env: NfeEnvironment, message: string) {
  if (env !== 'producao') return;
  Sentry.captureMessage('nfe: atenção', { level: 'warning', extra: { orderId, message } });
  await adminDb.collection('notifications').doc('seller').collection('items').doc().set({
    type: 'nfe_error',
    orderId,
    message: `Nota fiscal do pedido #${orderId.slice(-8).toUpperCase()}: ${message.slice(0, 300)}`,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  }).catch(() => {});
}

async function loadCustomer(order: FirebaseFirestore.DocumentData) {
  const uid = order.userId as string | undefined;
  const user = uid ? (await adminDb.collection('users').doc(uid).get()).data() ?? {} : {};
  let email = (user.email as string | undefined) || (order.customerEmail as string | undefined);
  if (!email && uid) email = await adminAuth.getUser(uid).then(u => u.email, () => undefined);
  return { name: String(user.name ?? user.displayName ?? order.customerName ?? ''), cpf: String(user.cpf ?? ''), email, phone: user.phone as string | undefined };
}

async function loadContext() {
  const cert = await loadCertificate();
  const config = nfeConfigFrom(await getSettings() as unknown as Record<string, unknown>);
  return { cert: cert ? { pfx: cert.pfx, password: cert.password } as SefazCert : null, config };
}

const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
/** Cliente da mesma cidade da loja: o código IBGE já é conhecido (sem consulta). */
function sameCityCode(addr: { city?: string; state?: string } | undefined, config: NfeConfig): string | null {
  return addr && norm(addr.city) === norm(config.municipio) && norm(addr.state) === norm(config.ufEmitente) ? config.codMunicipio : null;
}

/** Grava a nota autorizada (registro + XML) a partir do envio ou da consulta. */
async function markAuthorized(orderId: string, env: NfeEnvironment, rec: NfeRecord, data: { nProt: string; xml?: string; protNFe?: unknown }) {
  const now = new Date().toISOString();
  if (rec.chave) {
    await docsRef(orderId, rec.chave).set({
      ...(data.xml ? { xml: data.xml } : {}),
      ...(data.protNFe ? { protNFe: JSON.stringify(data.protNFe) } : {}),
      authorizedAt: now,
    }, { merge: true });
  }
  await writeRecord(orderId, env, {
    status: 'autorizada', nProt: data.nProt, authorizedAt: rec.authorizedAt ?? now, mensagem: null,
    docToken: nfeDocToken(orderId, env), xmlPendente: data.xml ? undefined : true,
  });
}

/** Envia (ou reenvia) a nota já identificada no registro e aplica o resultado. */
async function transmit(orderId: string, env: NfeEnvironment, rec: NfeRecord, cert: SefazCert, config: NfeConfig): Promise<NfeStatus> {
  const doc = (await docsRef(orderId, rec.chave!).get()).data();
  if (!doc?.nfe) throw new Error('nota sem conteúdo salvo');
  const nfe = JSON.parse(doc.nfe as string);
  const result = await authorize(env, cert, config.ufEmitente, config.cnpj, nfe, rec.chave!);
  switch (result.kind) {
    case 'autorizada':
      await markAuthorized(orderId, env, rec, { nProt: result.nProt, xml: result.xml });
      return 'autorizada';
    case 'duplicada':
      return reconcile(orderId, env, rec, cert, config, false);
    case 'incerta':
      await writeRecord(orderId, env, { status: 'processando', mensagem: `SEFAZ sem resposta (${result.motivo}); conferindo de novo em instantes` });
      return 'processando';
    case 'denegada':
      await writeRecord(orderId, env, { status: 'denegada', mensagem: `Uso denegado pela SEFAZ (${result.cStat}): ${result.motivo}` });
      await notify(orderId, env, `uso denegado pela SEFAZ (${result.motivo.slice(0, 200)})`);
      return 'denegada';
    case 'rejeitada': {
      const mensagem = `Rejeitada pela SEFAZ (${result.cStat}): ${result.motivo}`;
      await writeRecord(orderId, env, { status: 'erro', mensagem });
      await notify(orderId, env, mensagem);
      return 'erro';
    }
  }
}

/** Consulta a chave na SEFAZ e alinha o pedido. `resend`: reenviar se não constar. */
async function reconcile(orderId: string, env: NfeEnvironment, rec: NfeRecord, cert: SefazCert, config: NfeConfig, resend: boolean): Promise<NfeStatus> {
  const res = await consult(env, cert, config.ufEmitente, config.cnpj, rec.chave!);
  switch (res.kind) {
    case 'autorizada':
      await markAuthorized(orderId, env, rec, { nProt: res.nProt, protNFe: res.protNFe });
      return 'autorizada';
    case 'cancelada':
      await writeRecord(orderId, env, { status: 'cancelada', cancelledAt: rec.cancelledAt ?? new Date().toISOString(), mensagem: null });
      return 'cancelada';
    case 'denegada':
      await writeRecord(orderId, env, { status: 'denegada', mensagem: `Uso denegado: ${res.motivo}` });
      return 'denegada';
    case 'inexistente':
      if (resend && Date.now() - Date.parse(rec.requestedAt) > RESEND_AFTER_MS) return transmit(orderId, env, rec, cert, config);
      return 'processando';
    case 'erro':
      await writeRecord(orderId, env, { mensagem: `Consulta à SEFAZ falhou: ${res.motivo}` });
      return rec.status;
  }
}

/**
 * Emite a nota do pedido (ou continua uma emissão em andamento). Seguro para
 * chamar quantas vezes for.
 */
export async function issueNfe(orderId: string, env: NfeEnvironment, opts: { by?: string } = {}): Promise<NfeStatus> {
  const { cert, config } = await loadContext();
  if (!cert) throw new NfeError(NO_CERT);
  const field = nfeField(env);
  const homologacao = env === 'homologacao';

  const snap = await orderRef(orderId).get();
  if (!snap.exists) throw new NfeError('Pedido não encontrado', 404);
  const order = snap.data()!;
  const current = order[field] as NfeRecord | undefined;
  if (env === 'producao' && !PAID_STATUSES.has(order.status as string)) {
    throw new NfeError('A nota de produção só sai para pedido pago e não cancelado.');
  }
  if (current?.status === 'autorizada' || current?.status === 'denegada' || current?.status === 'inutilizada') return current.status;
  if (current?.status === 'processando') return syncNfe(orderId, env);

  // Antes de gastar um número: dados completos e município do cliente.
  const customer = await loadCustomer(order);
  const nfeOrder = { id: orderId, ...order } as NfeOrder;
  const problems = nfeProblems(nfeOrder, customer, config, homologacao);
  const cMunDest = problems.length === 0 ? (current?.cMunDest ?? sameCityCode(order.address, config) ?? await ibgeFromCep(order.address?.cep ?? '', order.address?.state ?? '')) : null;
  if (problems.length === 0 && !cMunDest) problems.push('não foi possível achar o município do CEP do cliente (tente de novo em instantes)');
  if (problems.length > 0) {
    const mensagem = `Faltam dados: ${problems.join('; ')}`;
    const status: NfeStatus = current?.numero ? 'erro' : 'pendente_dados';
    const now = new Date().toISOString();
    await orderRef(orderId).update({
      [field]: { ...(current ?? {}), environment: env, status, attempt: current?.attempt ?? 0, requestedAt: current?.requestedAt ?? now, updatedAt: now, mensagem },
    });
    await notify(orderId, env, mensagem);
    return status;
  }

  // Reserva o número e fixa a identidade da nota na mesma transação.
  const rec = await adminDb.runTransaction(async (tx): Promise<NfeRecord | NfeStatus> => {
    const [fresh, counter] = await Promise.all([tx.get(orderRef(orderId)), tx.get(counterRef())]);
    const o = fresh.data()!;
    if (env === 'producao' && !PAID_STATUSES.has(o.status as string)) {
      throw new NfeError('A nota de produção só sai para pedido pago e não cancelado.');
    }
    const prev = o[field] as NfeRecord | undefined;
    if (prev?.status === 'autorizada' || prev?.status === 'processando' || prev?.status === 'denegada' || prev?.status === 'inutilizada') return prev.status;

    let numero = prev?.status === 'erro' ? prev.numero : undefined; // rejeitada: mesmo número
    let serie = prev?.status === 'erro' ? prev.serie : undefined;
    if (!numero || !serie) {
      const c = (counter.get(env) as { serie?: number; proximo?: number } | undefined) ?? {};
      serie = config.serie;
      const floor = homologacao ? 1 : config.proximoNumero;
      numero = c.serie === serie ? Math.max(c.proximo ?? 1, floor) : floor;
      tx.set(counterRef(), { [env]: { serie, proximo: numero + 1 } }, { merge: true });
    }
    const dhEmi = brasiliaIso(new Date());
    const cNF = randomCNF(numero);
    const now = new Date().toISOString();
    const next: NfeRecord = {
      environment: env, status: 'processando', attempt: (prev?.attempt ?? 0) + 1,
      numero, serie, cNF, dhEmi, cMunDest: cMunDest!,
      chave: chaveAcesso(config.ufEmitente, dhEmi, config.cnpj, serie, numero, cNF),
      requestedAt: now, updatedAt: now, mensagem: null,
      ...(opts.by ? { by: opts.by } : {}),
    };
    tx.update(orderRef(orderId), { [field]: next });
    return next;
  });
  if (typeof rec === 'string') return rec === 'processando' ? syncNfe(orderId, env) : rec;

  // Conteúdo da nota salvo ANTES do envio: o reenvio usa exatamente o mesmo.
  const { nfe } = buildNfe(nfeOrder, customer, config, {
    numero: rec.numero!, serie: rec.serie!, cNF: rec.cNF!, dhEmi: rec.dhEmi!, homologacao, cMunDest: rec.cMunDest!,
  });
  await docsRef(orderId, rec.chave!).set({ environment: env, nfe: JSON.stringify(nfe), createdAt: rec.requestedAt });
  return transmit(orderId, env, rec, cert, config);
}

/** Nota em processamento: consulta a SEFAZ e reenvia se ela nunca chegou lá. */
export async function syncNfe(orderId: string, env: NfeEnvironment): Promise<NfeStatus> {
  const rec = (await orderRef(orderId).get()).get(nfeField(env)) as NfeRecord | undefined;
  if (!rec) throw new NfeError('Este pedido ainda não tem nota.');
  if (rec.status !== 'processando' || !rec.chave) return rec.status;
  const { cert, config } = await loadContext();
  if (!cert) return rec.status;
  return reconcile(orderId, env, rec, cert, config, true);
}

/** Cancela a nota autorizada (até 24h depois da autorização). */
export async function cancelNfe(orderId: string, env: NfeEnvironment, justificativa: string): Promise<NfeStatus> {
  const text = justificativa.replace(/\s+/g, ' ').trim();
  if (text.length < 15 || text.length > 255) throw new NfeError('A justificativa precisa ter entre 15 e 255 caracteres.');
  const rec = (await orderRef(orderId).get()).get(nfeField(env)) as NfeRecord | undefined;
  if (!rec || rec.status !== 'autorizada' || !rec.chave || !rec.nProt) throw new NfeError('Não há nota autorizada para cancelar.');
  if (rec.authorizedAt && Date.now() - Date.parse(rec.authorizedAt) > CANCEL_WINDOW_MS) {
    throw new NfeError('Passou o prazo de 24h para cancelar a nota. Emita uma nota de devolução.');
  }
  const { cert, config } = await loadContext();
  if (!cert) throw new NfeError(NO_CERT);
  const res = await cancel(env, cert, config.ufEmitente, config.cnpj, {
    chave: rec.chave, nProt: rec.nProt, justificativa: text, dhEvento: brasiliaIso(new Date()), ufCode: UF_CODE[config.ufEmitente],
  });
  if (res.ok) {
    await writeRecord(orderId, env, { status: 'cancelada', cancelledAt: new Date().toISOString(), mensagem: null });
    return 'cancelada';
  }
  // Pode ter sido cancelada e a resposta se perdido: a consulta tira a dúvida.
  const check = await consult(env, cert, config.ufEmitente, config.cnpj, rec.chave);
  if (check.kind === 'cancelada') {
    await writeRecord(orderId, env, { status: 'cancelada', cancelledAt: new Date().toISOString(), mensagem: null });
    return 'cancelada';
  }
  await writeRecord(orderId, env, { mensagem: `Cancelamento recusado: ${res.motivo}` });
  throw new NfeError(`A SEFAZ não cancelou a nota: ${res.motivo}`, 502);
}

/** Inutiliza o número de uma nota rejeitada (o pedido não vai mais ter nota). */
export async function inutilizeNfe(orderId: string, env: NfeEnvironment): Promise<NfeStatus> {
  const rec = (await orderRef(orderId).get()).get(nfeField(env)) as NfeRecord | undefined;
  if (!rec || rec.status !== 'erro' || !rec.numero || !rec.serie) throw new NfeError('Não há número de nota rejeitada para inutilizar.');
  const { cert, config } = await loadContext();
  if (!cert) throw new NfeError(NO_CERT);
  const res = await inutilizar(env, cert, config.ufEmitente, config.cnpj, {
    serie: rec.serie, numero: rec.numero, ano: (rec.dhEmi ?? brasiliaIso(new Date())).slice(2, 4),
    justificativa: 'Numero nao utilizado: venda cancelada antes da emissao da nota', ufCode: UF_CODE[config.ufEmitente],
  });
  if (!res.ok) {
    await writeRecord(orderId, env, { mensagem: `Inutilização recusada: ${res.motivo}` });
    throw new NfeError(`A SEFAZ não inutilizou o número: ${res.motivo}`, 502);
  }
  await writeRecord(orderId, env, { status: 'inutilizada', mensagem: null });
  return 'inutilizada';
}

/**
 * Pedido cancelado: cancela a nota de produção autorizada (até 24h), senão
 * avisa que precisa de nota de devolução; número rejeitado é inutilizado.
 * Nunca lança.
 */
export async function handleNfeOnOrderCancel(orderId: string): Promise<void> {
  try {
    const rec = (await orderRef(orderId).get()).get('nfe') as NfeRecord | undefined;
    if (!rec) return;
    if (rec.status === 'erro' && rec.numero) {
      await inutilizeNfe(orderId, 'producao').catch(err => notify(orderId, 'producao', `pedido cancelado; inutilize o número ${rec.numero} (${(err as Error).message})`));
      return;
    }
    if (rec.status === 'processando') {
      await notify(orderId, 'producao', 'pedido cancelado com a nota ainda em processamento. Confira no painel do pedido e cancele a nota se ela sair.');
      return;
    }
    if (rec.status !== 'autorizada') return;
    const withinWindow = !rec.authorizedAt || Date.now() - Date.parse(rec.authorizedAt) <= CANCEL_WINDOW_MS;
    if (withinWindow) {
      try {
        await cancelNfe(orderId, 'producao', 'Venda cancelada antes da entrega da mercadoria');
        return;
      } catch (err) {
        console.warn(`[nfe] cancelamento automático falhou (${orderId}):`, err);
      }
    }
    await notify(orderId, 'producao', `pedido cancelado com a nota nº ${rec.numero} ainda válida. ${withinWindow ? 'Cancele a nota no painel do pedido.' : 'Passou o prazo de cancelamento: emita uma nota de devolução.'}`);
  } catch (err) {
    console.error(`[nfe] handleNfeOnOrderCancel falhou (${orderId}):`, err);
  }
}

/** Emissão automática depois do pagamento (se ligada e com certificado). Nunca lança. */
export async function autoIssueNfe(orderId: string): Promise<void> {
  try {
    const config = nfeConfigFrom(await getSettings() as unknown as Record<string, unknown>);
    if (!config.autoEmit) return;
    if (!(await loadCertificate())) return; // sem certificado, não gera
    await issueNfe(orderId, config.environment, { by: 'auto' });
  } catch (err) {
    console.error(`[nfe] emissão automática falhou (${orderId}):`, err);
    Sentry.captureException(err, { tags: { area: 'nfe' }, extra: { orderId } });
  }
}
