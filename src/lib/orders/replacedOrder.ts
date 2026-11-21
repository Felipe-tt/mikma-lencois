import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { releaseCouponUse } from '@/lib/orders/couponUsage';
import { shortOrderId } from '@/lib/email/layout';

/**
 * Pedido refeito: o PIX vence, os itens continuam no carrinho, e o cliente
 * volta e paga um pedido novo. O pedido velho não cobra nada, mas confundia:
 * ficava na lista com "Gerar novo PIX" ao lado do pago (dava para pagar duas
 * vezes) e mandava "PIX expirou", "seu pedido espera o pagamento" e "pedido
 * cancelado" para quem já tinha comprado.
 */

const PAID_STATUSES = ['paid', 'preparing', 'shipped', 'delivered'];

type OrderLike = { userId?: unknown; createdAt?: unknown; items?: unknown };

const millis = (v: unknown): number => {
  if (typeof v === 'string') return Date.parse(v);
  const d = (v as { toDate?: () => Date } | null | undefined)?.toDate?.();
  return d ? d.getTime() : NaN;
};

const skusOf = (items: unknown): string[] =>
  (Array.isArray(items) ? items as Array<{ sku?: unknown }> : [])
    .map(i => i?.sku)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);

/** Mesmo cliente, um feito antes do outro e com algum produto em comum. */
function sameShopping(older: OrderLike, newer: OrderLike): boolean {
  const before = millis(older.createdAt);
  const after = millis(newer.createdAt);
  if (!(before < after)) return false;
  const skus = new Set(skusOf(older.items));
  return skusOf(newer.items).some(s => skus.has(s));
}

/** Pedido pago que refez este (o id), ou null. */
export async function paidReplacement(order: OrderLike): Promise<string | null> {
  if (typeof order.userId !== 'string' || !order.userId || skusOf(order.items).length === 0) return null;
  const paid = await adminDb.collection('orders')
    .where('userId', '==', order.userId)
    .where('status', 'in', PAID_STATUSES)
    .limit(50)
    .get();
  return paid.docs.find(d => sameShopping(order, d.data()))?.id ?? null;
}

/**
 * Cancela, sem e-mail, um pedido com o PIX vencido que outro já pago
 * substituiu. Só age em payment_expired (a reserva de estoque já voltou no
 * vencimento); devolve o uso do cupom. true se cancelou agora.
 */
export async function cancelReplaced(orderId: string, paidId: string): Promise<boolean> {
  const ref = adminDb.collection('orders').doc(orderId);
  const coupon = await adminDb.runTransaction(async (tx): Promise<false | { code?: string; uid?: string }> => {
    const snap = await tx.get(ref);
    if (snap.get('status') !== 'payment_expired') return false;
    const at = new Date().toISOString();
    tx.update(ref, {
      status: 'cancelled',
      cancelledAt: at,
      cancelledBy: 'sistema',
      replacedBy: paidId,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({ status: 'cancelled', at, note: `Cancelado: o cliente refez a compra no pedido #${shortOrderId(paidId)}, já pago` }),
    });
    return { code: snap.get('couponCode') as string | undefined, uid: snap.get('userId') as string | undefined };
  });
  if (!coupon) return false;
  await releaseCouponUse(coupon.code, coupon.uid);
  return true;
}

/** Pedido acabou de ser pago: tira os pedidos velhos que ele substitui. */
export async function cancelOrdersReplacedBy(paidId: string, paid: OrderLike): Promise<number> {
  if (typeof paid.userId !== 'string' || !paid.userId) return 0;
  const expired = await adminDb.collection('orders')
    .where('userId', '==', paid.userId)
    .where('status', '==', 'payment_expired')
    .limit(20)
    .get();
  let n = 0;
  for (const d of expired.docs) {
    if (d.id !== paidId && sameShopping(d.data(), paid) && await cancelReplaced(d.id, paidId)) n++;
  }
  return n;
}
