import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import type { CouponCustomerUsage } from '@/lib/orderPricing';
import { cpfBlindIndex, readPii } from '@/lib/piiCrypto';

/** Status de pedido que contam como compra paga (para "só na primeira compra"). */
const PAID_STATUSES = ['paid', 'preparing', 'shipped', 'delivered'];

/** Usos do cupom por cliente: coupons/{code}/clientes/{uid} { usos }. */
export const couponCustomerRef = (code: string, uid: string) =>
  adminDb.collection('coupons').doc(code).collection('clientes').doc(uid);

async function hasPaidOrder(uid: string): Promise<boolean> {
  const snap = await adminDb.collection('orders')
    .where('userId', '==', uid)
    .where('status', 'in', PAID_STATUSES)
    .limit(1)
    .get();
  return !snap.empty;
}

/**
 * O cliente já tem pedido pago? Fora da transação (consulta). Conta também
 * as outras contas com o mesmo CPF (cpfHash, o índice cego do CPF): sem
 * isso, uma conta nova com o mesmo CPF usava de novo o cupom de primeira
 * compra.
 */
export async function customerHasPaidOrder(uid: string): Promise<boolean> {
  if (await hasPaidOrder(uid)) return true;
  // Mesma busca do detector de golpe (lib/orders/risk.ts): pelo HMAC do CPF
  // e, enquanto houver perfis antigos em claro, pelo campo cpf.
  const users = adminDb.collection('users');
  const cpf = readPii((await users.doc(uid).get()).data()).cpf.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  const hash = process.env.PII_ENCRYPTION_KEY ? cpfBlindIndex(cpf) : null;
  const [byHash, byPlain] = await Promise.all([
    hash ? users.where('cpfHash', '==', hash).limit(10).get() : { docs: [] },
    users.where('cpf', '==', cpf).limit(10).get(),
  ]);
  const others = new Set([...byHash.docs, ...byPlain.docs].map(d => d.id).filter(id => id !== uid));
  for (const id of others) {
    if (await hasPaidOrder(id)) return true;
  }
  return false;
}

/** Uso do cupom por este cliente. Dentro de uma transação quando `tx` vem. */
export async function couponCustomerUsage(code: string, uid: string, tx?: Transaction, hasPaidOrder?: boolean): Promise<CouponCustomerUsage> {
  const ref = couponCustomerRef(code, uid);
  const [snap, paid] = await Promise.all([
    tx ? tx.get(ref) : ref.get(),
    hasPaidOrder ?? customerHasPaidOrder(uid),
  ]);
  return { uses: Math.max(0, (snap.get('usos') as number | undefined) ?? 0), hasPaidOrder: paid };
}

/** Na transação do pedido: soma 1 uso no total e 1 no cliente. */
export function consumeCouponUse(tx: Transaction, code: string, uid: string): void {
  tx.update(adminDb.collection('coupons').doc(code), { usedCount: FieldValue.increment(1) });
  tx.set(couponCustomerRef(code, uid), { usos: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/**
 * Devolve 1 uso de cupom (usedCount - 1, e o do cliente) quando um pedido
 * que consumiu o cupom não chega a ser pago: falha no gateway logo após
 * criar o pedido, cancelamento pelo cliente/lojista antes do pagamento ou
 * cancelamento automático por falta de pagamento.
 *
 * Sem isso, cada PIX abandonado "gastava" um uso pra sempre e cupons com
 * maxUses se esgotavam sem nenhuma venda de verdade.
 *
 * Best-effort: nunca lança (o fluxo que chama já concluiu o que importa).
 * Transação pra nunca deixar contagem negativa.
 */
export async function releaseCouponUse(couponCode: string | null | undefined, uid?: string | null): Promise<void> {
  if (!couponCode) return;
  const ref = adminDb.collection('coupons').doc(couponCode);
  const customerRef = uid ? couponCustomerRef(couponCode, uid) : null;
  try {
    await adminDb.runTransaction(async (tx) => {
      const [snap, customerSnap] = await Promise.all([tx.get(ref), customerRef ? tx.get(customerRef) : null]);
      if (!snap.exists) return;
      if (((snap.data()!.usedCount as number | undefined) ?? 0) > 0) tx.update(ref, { usedCount: FieldValue.increment(-1) });
      if (customerRef && ((customerSnap?.get('usos') as number | undefined) ?? 0) > 0) {
        tx.update(customerRef, { usos: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() });
      }
    });
  } catch (err) {
    console.error('[coupon] falha ao devolver uso do cupom', couponCode, err);
  }
}

/**
 * Conta de convidado virou conta de verdade (merge-guest): os usos de cupom
 * do convidado passam para a conta, senão o limite por cliente recomeçava.
 * Best-effort: nunca lança.
 */
export async function moveCouponUsage(code: string, fromUid: string, toUid: string): Promise<void> {
  const from = couponCustomerRef(code, fromUid);
  const to = couponCustomerRef(code, toUid);
  try {
    await adminDb.runTransaction(async tx => {
      const snap = await tx.get(from);
      const usos = (snap.get('usos') as number | undefined) ?? 0;
      if (!snap.exists) return;
      if (usos > 0) tx.set(to, { usos: FieldValue.increment(usos), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.delete(from);
    });
  } catch (err) {
    console.error('[coupon] falha ao mover usos do convidado', code, err);
  }
}
