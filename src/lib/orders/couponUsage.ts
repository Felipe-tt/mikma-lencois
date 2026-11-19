import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import type { CouponCustomerUsage } from '@/lib/orderPricing';

/** Status de pedido que contam como compra paga (para "só na primeira compra"). */
const PAID_STATUSES = ['paid', 'preparing', 'shipped', 'delivered'];

/** Usos do cupom por cliente: coupons/{code}/clientes/{uid} { usos }. */
export const couponCustomerRef = (code: string, uid: string) =>
  adminDb.collection('coupons').doc(code).collection('clientes').doc(uid);

/** O cliente já tem pedido pago? Fora da transação (consulta). */
export async function customerHasPaidOrder(uid: string): Promise<boolean> {
  const snap = await adminDb.collection('orders')
    .where('userId', '==', uid)
    .where('status', 'in', PAID_STATUSES)
    .limit(1)
    .get();
  return !snap.empty;
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
