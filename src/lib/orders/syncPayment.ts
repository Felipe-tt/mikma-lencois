import { adminDb } from '@/lib/firebase/admin';
import { checkPixStatus, getCheckoutStatus } from '@/lib/abacatepayApi';
import { confirmOrderPaid } from '@/lib/orders/confirmPayment';
import { expirePixOrder } from '@/lib/orders/expirePixOrder';

export type SyncResult = 'paid' | 'expired' | 'pending' | 'unchanged' | 'error';

/**
 * Consulta a AbacatePay e alinha o pedido com o status real da cobrança.
 * Rede de segurança para quando o webhook atrasa ou se perde: o cliente que
 * pagou não fica olhando "aguardando pagamento", e o PIX vencido libera o
 * estoque na hora (a API v2 não manda mais evento de expiração).
 */
export async function syncOrderPayment(orderId: string): Promise<SyncResult> {
  const snap = await adminDb.collection('orders').doc(orderId).get();
  if (!snap.exists) return 'error';
  const order = snap.data()!;
  if (order.status !== 'pending_payment') return 'unchanged';

  const payment = (order.payment ?? {}) as { method?: string; txId?: string; checkoutId?: string; abacateSandbox?: boolean; expiresAt?: unknown };
  const sandbox = !!payment.abacateSandbox;

  if (payment.method === 'pix' && payment.txId) {
    const res = await checkPixStatus(payment.txId, sandbox);
    if (!res.ok) {
      // 401 = chave sem a permissão de leitura de cobranças transparentes.
      if (res.status === 401) console.warn('[syncOrderPayment] chave da AbacatePay sem permissão para /transparents/check');
      return 'error';
    }
    const status = res.data.status;
    if (status === 'PAID' || status === 'APPROVED') {
      await confirmOrderPaid(orderId, payment.txId, `PIX confirmado (consulta à AbacatePay) · txId: ${payment.txId.slice(-8)}`);
      return 'paid';
    }
    if (status === 'EXPIRED' || status === 'CANCELLED') {
      await expirePixOrder(orderId, payment.txId, 'PIX expirou sem pagamento');
      return 'expired';
    }
    return 'pending';
  }

  if (payment.method === 'card' && payment.checkoutId) {
    const res = await getCheckoutStatus(payment.checkoutId, sandbox);
    if (!res.ok) return 'error';
    if (res.data.status === 'PAID' || res.data.status === 'APPROVED') {
      await confirmOrderPaid(orderId, payment.checkoutId, `Cartão confirmado (consulta à AbacatePay) · checkoutId: ${payment.checkoutId.slice(-8)}`);
      return 'paid';
    }
    return 'pending';
  }

  return 'unchanged';
}
