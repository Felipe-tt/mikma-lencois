import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { piiPatch } from '@/lib/piiCrypto';
import { deleteConversation } from '@/lib/email/deleteConversation';
import type { StoredFiles } from '@/lib/storageFiles';

/**
 * Prazos de retenção (LGPD), os mesmos da Política de Privacidade:
 * - pedido: 5 anos (prazo fiscal e do consumidor); depois disso o pedido
 *   fica só com os números (itens, valores, cidade) e perde nome, e-mail,
 *   endereço, IP e a avaliação do detector de golpe;
 * - nota fiscal (XML com nome, CPF e endereço): 5 anos contados do 1º de
 *   janeiro seguinte ao da emissão (CTN, art. 173);
 * - atendimento e trocas: 5 anos (conversa sem mensagem nova; troca pedida),
 *   com os anexos e as fotos;
 * - IP de quem fez o pedido: 1 ano (serve para o detector de golpe, que só
 *   compara pedidos recentes);
 * - conta de convidado sem pedido: 90 dias sem uso;
 * - pedido de "Avise-me quando chegar": 1 ano;
 * - fila da manutenção: 30 dias.
 * A mesma rotina criptografa o CPF e o telefone que ainda estejam em claro
 * em perfis antigos.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION = {
  orderYears: 5,
  orderIpDays: 365,
  guestDays: 90,
  restockDays: 365,
  maintenanceQueueDays: 30,
  supportYears: 5,
} as const;

/** Data limite: o que foi criado antes dela passou do prazo. */
export function cutoffIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

function yearsAgoIso(now: Date, years: number): string {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString();
}

export function orderCutoffIso(now: Date): string {
  return yearsAgoIso(now, RETENTION.orderYears);
}

/**
 * Nota emitida antes desta data já passou do prazo fiscal: 5 anos contados
 * do 1º de janeiro seguinte ao da emissão. Em 2032 saem as de 2026.
 */
export function nfeCutoffIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear() - 5, 0, 1)).toISOString();
}

/** Sem Storage (testes que não mexem em arquivo). */
const noFiles: StoredFiles = { deletePrefix: async () => {}, deletePath: async () => {}, privatizePrefix: async () => 0 };

/** Campos que um pedido antigo perde. A cidade e o estado ficam para relatórios. */
export function anonymizedOrderPatch(address: { city?: string; state?: string } | undefined, nowIso: string) {
  return {
    customerName: FieldValue.delete(),
    customerEmail: FieldValue.delete(),
    clientIp: FieldValue.delete(),
    addressKey: FieldValue.delete(),
    address: { cep: '', street: '', number: '', neighborhood: '', city: address?.city ?? '', state: address?.state ?? '' },
    anonymizedAt: nowIso,
  };
}

export interface RetentionResult {
  piiEncrypted: number;
  ordersAnonymized: number;
  orderIpsRemoved: number;
  guestsDeleted: number;
  restockDeleted: number;
  /** Avaliações do detector de golpe que saíram do pedido para orderRisk. */
  riskMoved: number;
  queueDeleted: number;
  nfeDeleted: number;
  conversationsDeleted: number;
  /** Anexos antigos de e-mail que deixaram de ser públicos. */
  attachmentsPrivatized: number;
  returnsDeleted: number;
}

// Por rodada: a rotina roda todo dia, então o que sobrar sai no dia seguinte
// (e cada rodada cabe no tempo de uma requisição).
const BATCH = 300;

export async function runRetention(db: Firestore, auth: Auth, now = new Date(), files: StoredFiles = noFiles): Promise<RetentionResult> {
  const nowIso = now.toISOString();
  const r: RetentionResult = {
    piiEncrypted: 0, ordersAnonymized: 0, orderIpsRemoved: 0, guestsDeleted: 0, restockDeleted: 0, queueDeleted: 0, riskMoved: 0,
    nfeDeleted: 0, conversationsDeleted: 0, returnsDeleted: 0, attachmentsPrivatized: 0,
  };

  // Perfis antigos com CPF/telefone em claro: criptografa (ver lib/piiCrypto.ts).
  if (process.env.PII_ENCRYPTION_KEY) {
    for (const field of ['cpf', 'phone'] as const) {
      const legacy = await db.collection('users').orderBy(field).limit(BATCH).get();
      for (const doc of legacy.docs) {
        const value = doc.get(field);
        if (typeof value !== 'string') continue;
        await doc.ref.set(piiPatch({ [field]: value }), { merge: true });
        r.piiEncrypted++;
      }
    }
  }

  // Pedidos: um cursor (ops/retention) guarda até onde cada limpeza já foi,
  // para cada pedido ser lido uma vez só, e não todo dia.
  const cursorRef = db.collection('ops').doc('retention');
  const cursor = (await cursorRef.get()).data() ?? {};

  // Pedidos com mais de 5 anos: anonimiza.
  const anonCut = orderCutoffIso(now);
  const old = await db.collection('orders')
    .where('createdAt', '>=', String(cursor.anonymizedUpTo ?? ''))
    .where('createdAt', '<', anonCut).orderBy('createdAt').limit(BATCH).get();
  for (const doc of old.docs) {
    if (!doc.get('anonymizedAt')) {
      await doc.ref.update(anonymizedOrderPatch(doc.get('address'), nowIso));
      // A avaliação do detector de golpe (outras contas, IPs) sai junto.
      await db.collection('orderRisk').doc(doc.id).delete();
      r.ordersAnonymized++;
    }
  }
  const anonymizedUpTo = old.size < BATCH ? anonCut : String(old.docs[old.size - 1].get('createdAt'));

  // IP dos pedidos com mais de 1 ano.
  const ipCut = cutoffIso(now, RETENTION.orderIpDays);
  const withIp = await db.collection('orders')
    .where('createdAt', '>=', String(cursor.ipRemovedUpTo ?? ''))
    .where('createdAt', '<', ipCut).orderBy('createdAt').limit(BATCH).get();
  for (const doc of withIp.docs) {
    if (!doc.get('clientIp')) continue;
    await doc.ref.update({ clientIp: FieldValue.delete() });
    r.orderIpsRemoved++;
  }
  const ipRemovedUpTo = withIp.size < BATCH ? ipCut : String(withIp.docs[withIp.size - 1].get('createdAt'));
  await cursorRef.set({ anonymizedUpTo, ipRemovedUpTo, lastRunAt: nowIso }, { merge: true });

  // Pedidos antigos com a avaliação inteira do detector de golpe no próprio
  // pedido (que o cliente lê): a avaliação vai para orderRisk (só a equipe
  // lê) e o pedido fica só com o hold. Ver lib/orders/risk.ts.
  const legacyRisk = await db.collection('orders').where('risk.level', 'in', ['baixo', 'atencao', 'alto']).limit(BATCH).get();
  for (const doc of legacyRisk.docs) {
    const risk = doc.get('risk') as { hold?: boolean } & Record<string, unknown>;
    await db.collection('orderRisk').doc(doc.id).set(risk, { merge: true });
    await doc.ref.update({ risk: { hold: !!risk.hold } });
    r.riskMoved++;
  }

  // Status da manutenção (público) gravado com o e-mail de quem mudou: fica
  // só "Equipe". Hoje grava o nome (lib/staffName.ts).
  const statusRef = db.collection('maintenance').doc('status');
  if (String((await statusRef.get()).data()?.updatedBy ?? '').includes('@')) {
    await statusRef.update({ updatedBy: 'Equipe' });
  }

  // Contas de convidado (login anônimo) paradas há 90 dias e sem pedido.
  const guestCutoff = now.getTime() - RETENTION.guestDays * DAY_MS;
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (r.guestsDeleted >= BATCH) break;
      if (u.providerData.length > 0 || u.email) continue;
      const last = Date.parse(u.metadata.lastRefreshTime ?? u.metadata.lastSignInTime ?? u.metadata.creationTime);
      if (!(last < guestCutoff)) continue;
      const orders = await db.collection('orders').where('userId', '==', u.uid).limit(1).get();
      if (!orders.empty) continue;
      await Promise.all([
        auth.deleteUser(u.uid),
        db.collection('users').doc(u.uid).delete(),
        db.collection('carts').doc(u.uid).delete(),
      ]);
      r.guestsDeleted++;
    }
    pageToken = r.guestsDeleted >= BATCH ? undefined : page.pageToken;
  } while (pageToken);

  // "Avise-me quando chegar" com mais de 1 ano.
  const restock = await db.collection('restockRequests').where('createdAt', '<', cutoffIso(now, RETENTION.restockDays)).limit(BATCH).get();
  await Promise.all(restock.docs.map(d => d.ref.delete()));
  r.restockDeleted = restock.size;

  // Notas fiscais fora do prazo fiscal. Grupo de coleção (orders/*/nfeDocs):
  // sem o índice pronto a consulta falha, e o resto da rotina segue.
  try {
    const xmls = await db.collectionGroup('nfeDocs').where('createdAt', '<', nfeCutoffIso(now)).limit(BATCH).get();
    await Promise.all(xmls.docs.map(d => d.ref.delete()));
    r.nfeDeleted = xmls.size;
  } catch (err) {
    console.error('[retention] notas fiscais antigas', err);
  }

  // Atendimento e trocas com mais de 5 anos, com os anexos e as fotos.
  const supportCut = yearsAgoIso(now, RETENTION.supportYears);
  const convs = await db.collection('conversations').where('lastMessageAt', '<', supportCut).limit(50).get();
  for (const c of convs.docs) {
    await deleteConversation(db, files, c.ref);
    r.conversationsDeleted++;
  }
  // Anexos de e-mail de antes de ficarem privados: fecha o acesso público.
  try {
    r.attachmentsPrivatized = await files.privatizePrefix('email-attachments/');
  } catch (err) {
    console.error('[retention] anexos de e-mail', err);
  }
  const trocas = await db.collection('returns').where('createdAt', '<', supportCut).limit(BATCH).get();
  for (const t of trocas.docs) {
    const fotos = (t.get('fotos') as unknown[] | undefined) ?? [];
    await Promise.all(fotos.filter((f): f is string => typeof f === 'string').map(f => files.deletePath(f)));
    await t.ref.delete();
    r.returnsDeleted++;
  }

  // Fila da manutenção com mais de 30 dias.
  const queue = await db.collection('maintenance_queue').where('lastSeenAt', '<', cutoffIso(now, RETENTION.maintenanceQueueDays)).limit(BATCH).get();
  await Promise.all(queue.docs.map(d => d.ref.delete()));
  r.queueDeleted = queue.size;

  return r;
}
