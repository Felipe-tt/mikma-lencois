import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';
import { expandStockLines } from '@/lib/orderStockLines';
import { buildPixExpired } from '@/lib/email/orderStatusEmails';
import { CONTACT_EMAIL } from '@/lib/email/layout';

/**
 * PIX venceu sem pagamento: pedido vai para payment_expired e a reserva de
 * estoque é liberada, na MESMA transação que confere o status (um pagamento
 * confirmado ao mesmo tempo não pode ser marcado como expirado). Depois avisa
 * o cliente por e-mail, com o link para gerar um PIX novo.
 *
 * Usado pelo webhook (evento legado), pela checagem de status do pedido e
 * pelo cron. `txId`, quando vem, precisa ser o PIX atual do pedido: um PIX
 * antigo vencendo depois de o cliente gerar outro não expira o novo.
 *
 * Devolve true se expirou agora (false se já não estava pendente).
 */
export async function expirePixOrder(orderId: string, txId: string | undefined, note: string): Promise<boolean> {
  const orderRef = adminDb.collection('orders').doc(orderId);
  const order = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return null;
    const data = snap.data()!;
    if (data.status !== 'pending_payment') return null;
    if (txId && data.payment?.txId && txId !== data.payment.txId) return null;

    const lines = expandStockLines(data.items as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>);
    const invRefs = lines.map(line => adminDb.collection('inventory').doc(line.sku));
    const invSnaps = invRefs.length > 0 ? await tx.getAll(...invRefs) : [];

    tx.update(orderRef, {
      status: 'payment_expired',
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({ status: 'payment_expired', at: new Date().toISOString(), note }),
    });
    lines.forEach((line, i) => {
      if (!invSnaps[i].exists) return;
      tx.update(invRefs[i], { reserved: FieldValue.increment(-line.quantity), updatedAt: FieldValue.serverTimestamp() });
    });
    return data;
  });
  if (!order) return false;

  try {
    const userSnap = await adminDb.collection('users').doc(order.userId as string).get();
    const userData = userSnap.data() ?? {};
    const name = String(userData.name ?? userData.displayName ?? 'Cliente').split(' ')[0] || 'cliente';
    let email = userData.email as string | undefined;
    if (!email) {
      try { email = (await adminAuth.getUser(order.userId as string)).email; } catch { /* conta removida */ }
    }
    if (email) {
      const payload = buildPixExpired({ id: orderId, totalCents: order.totalCents as number }, name);
      await sendEmail({ to: email, subject: payload.subject, text: payload.text, html: payload.html, from: 'noreply', replyTo: CONTACT_EMAIL });
    }
  } catch (err) {
    console.error('[expirePixOrder] e-mail de PIX expirado falhou (ignorado):', err);
  }
  return true;
}
