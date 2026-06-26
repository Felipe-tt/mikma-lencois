export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';

const ABACATEPAY_PUBLIC_KEY = process.env.ABACATEPAY_PUBLIC_KEY!;

function verifySignature(payload: string, signature: string): boolean {
  if (!ABACATEPAY_PUBLIC_KEY) return false;
  try {
    const expected = createHmac('sha256', ABACATEPAY_PUBLIC_KEY)
      .update(Buffer.from(payload, 'utf8'))
      .digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-abacatepay-signature') ?? '';

  if (!verifySignature(rawBody, signature)) {
    console.warn('Invalid webhook signature — received:', signature.slice(0, 20));
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Rejeita payloads muito grandes (webhook legítimo não passa de 8KB)
  if (rawBody.length > 8192) {
    return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // AbacatePay v2 envelope: { event, apiVersion, data: { transparent: { id, externalId, ... }, customer, ... } }
  const { event: eventType, data } = parsed as {
    event: string;
    data: { transparent: Record<string, unknown>; customer?: Record<string, unknown> };
  };

  console.log('Webhook received:', eventType);

  // ── Helper: confirm an order as paid ─────────────────────────────────────
  async function confirmOrder(orderId: string, txId: string, note: string) {
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      console.error('Order not found:', orderId);
      return;
    }

    const order = orderSnap.data()!;

    if (order.status !== 'pending_payment') {
      console.log('Order already processed:', orderId, '— status:', order.status);
      return;
    }

    const now = new Date().toISOString();
    const batch = adminDb.batch();

    batch.update(orderRef, {
      status: 'paid',
      'payment.paidAt': FieldValue.serverTimestamp(),
      'payment.txId': txId,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({ status: 'paid', at: now, note }),
    });

    for (const item of order.items as Array<{ sku: string; quantity: number }>) {
      const invRef = adminDb.collection('inventory').doc(item.sku);
      // NOTE: only 'quantity' is decremented here, not 'reserved'.
      // Nothing in this codebase currently increments 'reserved' when
      // an order is created — decrementing it on every paid order with
      // no matching increment anywhere drives it permanently negative,
      // which inflates available stock (available = quantity - reserved)
      // a little more with every single sale. If/when proper stock
      // reservation is added at order-creation time, this should also
      // decrement 'reserved' by item.quantity to match.
      batch.update(invRef, {
        quantity: FieldValue.increment(-item.quantity),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // ── Limpa o carrinho do cliente ───────────────────────────────────────
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
      message: `Novo pedido pago: #${orderId.slice(-8).toUpperCase()}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    console.log(`Order ${orderId} confirmed — ${note}`);

    // ── Email de confirmação ao cliente ───────────────────────────────────
    // Fora do batch (best-effort — falha de email não reverte o pedido)
    try {
      const userSnap = await adminDb.collection('users').doc(order.userId as string).get();
      const userData = userSnap.data() ?? {};
      const customerEmail = userData.email as string | undefined;
      const customerName  = (userData.name ?? userData.displayName ?? 'Cliente') as string;

      if (customerEmail) {
        const orderUrl = `https://mikma.com.br/pedidos/${orderId}`;
        const shortId  = orderId.slice(-8).toUpperCase();
        const items    = order.items as Array<{ productName: string; quantity: number; unitPrice: number }>;
        const itemLines = items
          .map(i => `${i.quantity}x ${i.productName} — ${formatCurrency(i.unitPrice * i.quantity)}`)
          .join('\n');

        const payMethod = (order.payment as { method: string }).method === 'pix' ? 'PIX' : 'Cartão de crédito';
        const total = formatCurrency(order.totalCents as number);

        await sendEmail({
          to: customerEmail,
          subject: `Pedido #${shortId} confirmado — Mikma Lençóis`,
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
            '— Equipe Mikma Lençóis',
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

        console.log(`[webhook] email de confirmação enviado para ${customerEmail} — pedido ${orderId}`);
      }
    } catch (emailErr) {
      // Falha de email não deve quebrar o webhook — pedido já foi confirmado
      console.error('[webhook] falha ao enviar email de confirmação:', emailErr);
    }
  }

  if (eventType === 'transparent.completed') {
    const transparent = data.transparent;
    const txId = transparent.id as string;
    const orderId = transparent.externalId as string | undefined;

    if (!orderId) {
      console.error('transparent.completed missing externalId — txId:', txId);
      return NextResponse.json({ ok: true });
    }

    await confirmOrder(orderId, txId, `PIX confirmado · txId: ${txId.slice(-8)}`);
  }

  if (eventType === 'checkout.completed') {
    // Card checkout — data envelope has { checkout: { id, externalId, ... } }
    const checkoutData = (data as Record<string, unknown>).checkout as Record<string, unknown> | undefined;
    const txId = (checkoutData?.id ?? '') as string;
    const orderId = checkoutData?.externalId as string | undefined;

    if (!orderId) {
      console.error('checkout.completed missing externalId — txId:', txId);
      return NextResponse.json({ ok: true });
    }

    await confirmOrder(orderId, txId, `Cartão confirmado · checkoutId: ${txId.slice(-8)}`);
  }

  // Always 200 for other event types (transparent.refunded, subscription.*, etc.)
  return NextResponse.json({ ok: true });
}
