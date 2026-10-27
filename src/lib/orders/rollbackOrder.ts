import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { expandStockLines } from '@/lib/orderStockLines';
import { releaseCouponUse } from '@/lib/orders/couponUsage';

/**
 * Desfaz um pedido recém-criado cuja cobrança não chegou a existir (gateway
 * recusou ou não respondeu na criação): apaga o pedido e devolve a reserva de
 * estoque na MESMA transação, depois devolve o uso do cupom.
 *
 * Antes cada rota fazia isso em passos soltos, com a devolução do estoque sem
 * await: se a instância encerrasse no meio, o pedido sumia e a reserva ficava
 * presa para sempre (nenhum cron a encontrava mais). Só age se o pedido ainda
 * estiver aguardando pagamento, então chamar duas vezes não devolve em dobro.
 */
export async function rollbackUnpaidOrder(orderId: string): Promise<boolean> {
  const orderRef = adminDb.collection('orders').doc(orderId);
  const couponCode = await adminDb.runTransaction(async (tx): Promise<string | null | false> => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return false;
    const order = snap.data()!;
    if (order.status !== 'pending_payment') return false;
    const lines = expandStockLines((order.items ?? []) as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>);
    const invRefs = lines.map(line => adminDb.collection('inventory').doc(line.sku));
    const invSnaps = invRefs.length > 0 ? await tx.getAll(...invRefs) : [];
    tx.delete(orderRef);
    lines.forEach((line, i) => {
      if (!invSnaps[i].exists) return;
      tx.update(invRefs[i], { reserved: FieldValue.increment(-line.quantity), updatedAt: FieldValue.serverTimestamp() });
    });
    return (order.couponCode as string | undefined) ?? null;
  });
  if (couponCode === false) return false;
  await releaseCouponUse(couponCode);
  return true;
}
