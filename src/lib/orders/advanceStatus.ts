import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email';
import type { Order, OrderStatus, User } from '@/types';
import { buildPreparing, buildShipped, buildDelivered } from '@/lib/email/orderStatusEmails';
import { isManualDispatch } from '@/lib/carriers';
import { recordShippingSpent } from '@/lib/shipping-ledger';
import { shippingBlockReason } from '@/lib/orders/shippingBlock';

/**
 * Avança o pedido uma etapa (pago, separando, enviado, entregue) e manda o
 * e-mail ao cliente. Usado pelo painel (update-status) e pelo rastreio
 * automático dos Correios (cron correios-rastreio).
 */
export const ALLOWED: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: 'preparing',
  preparing: 'shipped',
  shipped: 'delivered',
};

export class StatusError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function advanceOrderStatus(
  orderId: string,
  opts: { fromStatus?: string; trackingCode?: string; note?: string } = {},
): Promise<{ order: Order; next: OrderStatus; emailError: string | null }> {
  const ref = adminDb.collection('orders').doc(orderId);
  const now = new Date().toISOString();

  // Leitura e escrita na mesma transação: antes eram separadas, e dois
  // toques seguidos faziam o pedido pular de "pago" direto pra "enviado"
  // (sem rastreio) com dois e-mails pro cliente.
  const { order, next } = await adminDb.runTransaction(async (tx): Promise<{ order: Order; next: OrderStatus }> => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new StatusError(404, 'Pedido não encontrado');
    const current = { id: snap.id, ...snap.data() } as Order;
    if (opts.fromStatus && opts.fromStatus !== current.status) {
      throw new StatusError(409, 'Este pedido já foi atualizado. Atualize a página.');
    }
    const target = ALLOWED[current.status];
    if (!target) throw new StatusError(400, `Não é possível avançar de "${current.status}"`);
    if (target === 'shipped') {
      const blocked = shippingBlockReason(current);
      if (blocked) throw new StatusError(409, blocked);
    }

    const update: Record<string, unknown> = {
      status: target,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({ status: target, at: now, ...(opts.note ? { note: opts.note } : {}) }),
    };
    if (target === 'shipped') {
      if (opts.trackingCode) update['delivery.trackingCode'] = opts.trackingCode;
      update['delivery.dispatchedAt'] = FieldValue.serverTimestamp();
      // Custo do frete deste pedido, para o caixa de frete poder ser refeito
      // a partir dos pedidos (ver recomputeShippingLedger).
      const cost = (current.delivery as { realPriceCents?: number } | undefined)?.realPriceCents ?? 0;
      if (isManualDispatch(current.delivery?.carrier ?? '') && cost > 0) update['delivery.shippingCostCents'] = cost;
    }
    if (target === 'delivered') {
      update['delivery.deliveredAt'] = FieldValue.serverTimestamp();
    }
    tx.update(ref, update);
    return { order: current, next: target };
  });

  // Despacho manual (Correios/Jadlog): registra no caixa de frete o valor
  // cotado como custo estimado. Antes isso vinha da compra da etiqueta no
  // Melhor Envio; sem registrar, o teto de prejuízo do frete grátis
  // (freeShippingMaxLossCents) nunca disparava. Best-effort.
  if (next === 'shipped') {
    const carrier = order.delivery?.carrier ?? '';
    const estimatedCost = (order.delivery as { realPriceCents?: number } | undefined)?.realPriceCents ?? 0;
    if (isManualDispatch(carrier) && estimatedCost > 0) {
      try { await recordShippingSpent(estimatedCost); }
      catch (err) { console.warn(`[shipping-ledger] falha ao registrar gasto do pedido ${orderId}:`, err); }
    }
  }

  // Email ao cliente
  let emailError: string | null = null;
  try {
    const uSnap = await adminDb.collection('users').doc(order.userId).get();
    const userData = uSnap.data() as User | undefined;
    const customerEmail = userData?.email;
    const firstName = (userData?.name ?? '').split(' ')[0] || 'cliente';

    if (customerEmail) {
      const updatedOrder: Order = {
        ...order,
        status: next,
        delivery: {
          ...order.delivery,
          ...(next === 'shipped' && opts.trackingCode ? { trackingCode: opts.trackingCode } : {}),
        },
      };

      const payload =
        next === 'preparing' ? buildPreparing(updatedOrder, firstName) :
        next === 'shipped'   ? buildShipped(updatedOrder, firstName) :
        next === 'delivered' ? buildDelivered(updatedOrder, firstName) : null;

      if (payload) {
        await sendEmail({
          to: customerEmail,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          from: 'noreply',
          replyTo: 'contato@mikma.com.br',
        });
      }
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.error('[update-status] email error:', emailError);
  }


  return { order, next, emailError };
}
