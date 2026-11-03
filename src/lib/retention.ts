import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { piiPatch } from '@/lib/piiCrypto';

/**
 * Prazos de retenção (LGPD), os mesmos da Política de Privacidade:
 * - pedido: 5 anos (prazo fiscal e do consumidor); depois disso o pedido
 *   fica só com os números (itens, valores, cidade) e perde nome, e-mail,
 *   endereço e IP;
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
} as const;

/** Data limite: o que foi criado antes dela passou do prazo. */
export function cutoffIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

export function orderCutoffIso(now: Date): string {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - RETENTION.orderYears);
  return d.toISOString();
}

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
  queueDeleted: number;
}

// Por rodada: a rotina roda todo dia, então o que sobrar sai no dia seguinte
// (e cada rodada cabe no tempo de uma requisição).
const BATCH = 300;

export async function runRetention(db: Firestore, auth: Auth, now = new Date()): Promise<RetentionResult> {
  const nowIso = now.toISOString();
  const r: RetentionResult = { piiEncrypted: 0, ordersAnonymized: 0, orderIpsRemoved: 0, guestsDeleted: 0, restockDeleted: 0, queueDeleted: 0 };

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

  // Fila da manutenção com mais de 30 dias.
  const queue = await db.collection('maintenance_queue').where('lastSeenAt', '<', cutoffIso(now, RETENTION.maintenanceQueueDays)).limit(BATCH).get();
  await Promise.all(queue.docs.map(d => d.ref.delete()));
  r.queueDeleted = queue.size;

  return r;
}
