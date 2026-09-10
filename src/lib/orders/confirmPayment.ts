import * as Sentry from '@sentry/nextjs';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';
import { notifySeller } from '@/lib/push/notifySeller';
import { summarizeOrderItems } from '@/lib/push/summarizeOrderItems';
import { expandStockLines } from '@/lib/orderStockLines';
import { recordShippingCollected } from '@/lib/shipping-ledger';

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Confirma um pedido como pago: status -> 'paid', debita estoque real,
 * libera a reserva, limpa o carrinho, notifica o vendedor e envia o e-mail
 * de confirmação pro cliente.
 *
 * Usado tanto pelo webhook real da AbacatePay (pagamento pela plataforma)
 * quanto pela confirmação manual no painel (pagamento por fora: dinheiro,
 * transferência direta, outra plataforma). Mesmo caminho de código para os
 * dois — assim um pedido confirmado manualmente passa exatamente pelos
 * mesmos efeitos colaterais de um pago pela AbacatePay, sem duplicar lógica
 * e sem risco de esquecer de debitar estoque ou notificar em um dos dois.
 *
 * `manual`, quando presente, marca o pedido com quem confirmou e por quê,
 * pra auditoria (nunca deve ser possível confundir com um pagamento real
 * passado pela AbacatePay).
 *
 * Retorna `true` se o pedido foi de fato confirmado agora (idempotente:
 * `false` se não existe ou já não estava mais 'pending_payment' — webhooks
 * duplicados/atrasados e cliques duplicados no botão manual caem aqui sem
 * duplicar nenhum efeito).
 */
export async function confirmOrderPaid(
  orderId: string,
  txId: string,
  note: string,
  manual?: { uid: string; note: string }
): Promise<boolean> {
  const orderRef = adminDb.collection('orders').doc(orderId);
  const now = new Date().toISOString();

  let order: FirebaseFirestore.DocumentData | null;
  try {
    order = await adminDb.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) return null;
      const data = orderSnap.data()!;
      if (data.status !== 'pending_payment') return null;

      tx.update(orderRef, {
        status: 'paid',
        'payment.paidAt': FieldValue.serverTimestamp(),
        'payment.txId': txId,
        ...(manual ? {
          'payment.confirmedManuallyBy': manual.uid,
          'payment.confirmedManuallyNote': manual.note,
        } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({ status: 'paid', at: now, note }),
      });

      // Decrementa quantity (estoque real, debitado de fato) e reserved
      // (libera a reserva feita em create-checkout/create-pix na criação
      // do pedido), ambos pelo mesmo motivo: a venda se concretizou.
      // expandStockLines inclui a fronha trocada (Jogo de Cama) junto.
      for (const line of expandStockLines(data.items as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>)) {
        const invRef = adminDb.collection('inventory').doc(line.sku);
        tx.update(invRef, {
          quantity: FieldValue.increment(-line.quantity),
          reserved: FieldValue.increment(-line.quantity),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      return data;
    });
  } catch (err) {
    console.error(`Failed to confirm order ${orderId}:`, err);
    Sentry.captureException(err, { tags: { route: 'confirm-order-paid' }, extra: { orderId, manual: !!manual } });
    return false;
  }

  if (!order) {
    console.log('Order not found or already processed:', orderId);
    return false;
  }

  // ── Caixa de frete: registra o que foi de fato cobrado do cliente ─────
  // Best-effort, nunca deve travar a confirmação do pedido.
  try {
    const shippingCollected = (order.shippingCents as number) ?? 0;
    if (shippingCollected > 0) await recordShippingCollected(shippingCollected);
  } catch (err) {
    console.warn(`[shipping-ledger] falha ao registrar coleta do pedido ${orderId}:`, err);
  }

  // ── Limpa o carrinho do cliente + notifica vendedor ───────────────────
  // Fora da transação (best-effort, não precisa ser atômico com o
  // pagamento em si).
  const batch = adminDb.batch();
  const cartRef = adminDb.collection('carts').doc(order.userId as string);
  batch.update(cartRef, { items: [], updatedAt: FieldValue.serverTimestamp() });

  const notifRef = adminDb
    .collection('notifications')
    .doc('seller')
    .collection('items')
    .doc();
  batch.set(notifRef, {
    type: 'new_order',
    orderId,
    message: manual
      ? `Pedido marcado como pago manualmente: #${orderId.slice(-8).toUpperCase()}`
      : `Novo pedido pago: #${orderId.slice(-8).toUpperCase()}`,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  console.log(`Order ${orderId} confirmed, ${note}`);

  // Push pro vendedor (best-effort, nunca deve afetar a confirmação do pedido)
  const payMethodLabel = (order.payment as { method: string }).method === 'pix' ? 'PIX' : 'Cartão';
  await notifySeller({
    title: manual ? 'Pagamento confirmado manualmente' : 'Pagamento confirmado 🎉',
    body: `${summarizeOrderItems((order.items ?? []) as { productName: string; quantity: number }[])} · ${formatCurrency(order.totalCents as number)} · ${manual ? 'manual' : payMethodLabel}`,
    url: `/painel/pedidos/${orderId}`,
    data: { orderId, event: 'payment_confirmed' },
  });

  // ── Email de confirmação ao cliente ───────────────────────────────────
  // Fora do batch (best-effort, falha de email não reverte o pedido)
  try {
    const userSnap = await adminDb.collection('users').doc(order.userId as string).get();
    const userData = userSnap.data() ?? {};
    const customerName = (userData.name ?? userData.displayName ?? 'Cliente') as string;

    let customerEmail = userData.email as string | undefined;
    if (!customerEmail) {
      try {
        const authUser = await adminAuth.getUser(order.userId as string);
        customerEmail = authUser.email;
      } catch {
        console.warn(`[confirm-order-paid] não foi possível obter email do Auth para uid=${order.userId}`);
      }
    }

    if (customerEmail) {
      const orderUrl = `https://mikma.com.br/pedidos/${orderId}`;
      const shortId  = orderId.slice(-8).toUpperCase();
      const items    = order.items as Array<{ productName: string; quantity: number; unitPrice: number }>;
      const itemLines = items
        .map(i => `${i.quantity}x ${i.productName}, ${formatCurrency(i.unitPrice * i.quantity)}`)
        .join('\n');

      const payMethod = (order.payment as { method: string }).method === 'pix' ? 'PIX' : 'Cartão de crédito';
      const total = formatCurrency(order.totalCents as number);

      await sendEmail({
        to: customerEmail,
        subject: `Pedido #${shortId} confirmado, Mikma Lençóis`,
        text: [
          `Olá, ${customerName}!`,
          '',
          `Seu pedido #${shortId} foi confirmado. Obrigado pela compra!`,
          '',
          'ITENS:',
          itemLines,
          '',
          `Total: ${total} via ${payMethod}`,
          '',
          `Acompanhe seu pedido: ${orderUrl}`,
          '',
          'Qualquer dúvida, responda este e-mail.',
          'Equipe Mikma Lençóis',
        ].join('\n'),
        html: `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#ffffff;border:1px solid #E6DFD5;">
  <tr><td style="background:#1E1208;padding:28px 32px;">
    <p style="margin:0;color:#FAF8F5;font-size:20px;font-style:italic;letter-spacing:1px;">Mikma Lençóis</p>
  </td></tr>
  <tr><td style="padding:36px;">
    <p style="margin:0 0 6px;font-size:18px;color:#1E1208;font-weight:bold;">Pedido confirmado!</p>
    <p style="margin:0 0 24px;font-size:14px;color:#705A48;">Olá, ${customerName}. Recebemos seu pagamento e estamos preparando seu pedido.</p>

    <p style="margin:0 0 8px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#B09C8C;">Pedido #${shortId}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E6DFD5;margin-bottom:24px;">
      ${items.map(i => `
      <tr><td style="padding:10px 14px;border-bottom:1px solid #F0EAE1;font-size:13px;color:#1E1208;">
        ${i.quantity}x ${i.productName}
      </td><td style="padding:10px 14px;border-bottom:1px solid #F0EAE1;font-size:13px;color:#1E1208;text-align:right;white-space:nowrap;">
        ${formatCurrency(i.unitPrice * i.quantity)}
      </td></tr>`).join('')}
      <tr><td style="padding:12px 14px;font-size:14px;font-weight:bold;color:#1E1208;">Total</td>
          <td style="padding:12px 14px;font-size:14px;font-weight:bold;color:#1E1208;text-align:right;">${total}</td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:24px;">
      <a href="${orderUrl}" style="display:inline-block;background:#C4714A;color:#ffffff;font-family:Georgia,serif;font-size:14px;font-weight:bold;text-decoration:none;padding:14px 36px;">
        Acompanhar pedido
      </a>
    </td></tr></table>

    <p style="margin:0;font-size:12px;color:#B09C8C;text-align:center;">
      Dúvidas? Responda este e-mail ou acesse <a href="https://mikma.com.br" style="color:#C4714A;">mikma.com.br</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
        from: 'noreply',
      });

      console.log(`[confirm-order-paid] email de confirmação enviado para ${customerEmail}, pedido ${orderId}`);
    }
  } catch (emailErr) {
    // Falha de email não deve quebrar a confirmação, pedido já foi confirmado
    console.error('[confirm-order-paid] falha ao enviar email de confirmação:', emailErr);
  }

  return true;
}
