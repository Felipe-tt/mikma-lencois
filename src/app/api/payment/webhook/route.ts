export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';
import { notifySeller } from '@/lib/push/notifySeller';
import { summarizeOrderItems } from '@/lib/push/summarizeOrderItems';
import { getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { recordShippingCollected } from '@/lib/shipping-ledger';
import { z } from 'zod';
import { webhookSchema } from './schema';


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
  // Defesa contra flood — a AbacatePay manda poucos eventos por transação
  // em operação normal; isso só protege contra abuso/DoS na URL pública.
  const ip = getClientIp(req);
  if (!await rateLimit(`payment-webhook-ip:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

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

  const validated = webhookSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn('Webhook payload inválido:', validated.error.issues[0]?.message);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // AbacatePay v2 envelope: { event, apiVersion, data: { transparent: { id, externalId, ... }, customer, ... } }
  const { event: eventType, data } = validated.data as {
    event: string;
    data: { transparent: Record<string, unknown>; customer?: Record<string, unknown> };
  };

  console.log('Webhook received:', eventType);

  // ── Helper: confirm an order as paid ─────────────────────────────────────
  async function confirmOrder(orderId: string, txId: string, note: string) {
    const orderRef = adminDb.collection('orders').doc(orderId);
    const now = new Date().toISOString();

    // Transação: lê e escreve o status atomicamente. O cron de expiração
    // (expire-orders) também decide com base em status === 'pending_payment'
    // — sem essa transação, o cron poderia cancelar e decrementar reserved
    // entre o get() e o commit() daqui, duplicando o decremento e deixando
    // o pedido marcado 'cancelled' por cima de um pagamento real.
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
          updatedAt: FieldValue.serverTimestamp(),
          timeline: FieldValue.arrayUnion({ status: 'paid', at: now, note }),
        });

        // Decrementa quantity (estoque real, debitado de fato) e reserved
        // (libera a reserva feita em create-checkout/create-pix na criação
        // do pedido) — ambos pelo mesmo motivo: a venda se concretizou.
        for (const item of data.items as Array<{ sku: string; quantity: number }>) {
          const invRef = adminDb.collection('inventory').doc(item.sku);
          tx.update(invRef, {
            quantity: FieldValue.increment(-item.quantity),
            reserved: FieldValue.increment(-item.quantity),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        return data;
      });
    } catch (err) {
      console.error(`Failed to confirm order ${orderId}:`, err);
      Sentry.captureException(err, { tags: { route: 'payment-webhook', step: 'confirm-order' }, extra: { orderId } });
      return;
    }

    if (!order) {
      console.log('Order not found or already processed:', orderId);
      return;
    }

    // ── Caixa de frete: registra o que foi de fato cobrado do cliente ─────
    // Best-effort — nunca deve travar a confirmação do pedido.
    try {
      const shippingCollected = (order.shippingCents as number) ?? 0;
      if (shippingCollected > 0) await recordShippingCollected(shippingCollected);
    } catch (err) {
      console.warn(`[shipping-ledger] falha ao registrar coleta do pedido ${orderId}:`, err);
    }

    // ── Limpa o carrinho do cliente + notifica vendedor ───────────────────
    // Fora da transação (best-effort — não precisa ser atômico com o
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
      message: `Novo pedido pago: #${orderId.slice(-8).toUpperCase()}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    console.log(`Order ${orderId} confirmed — ${note}`);

    // Push pro vendor (best-effort — nunca deve afetar a confirmação do pedido)
    const payMethodLabel = (order.payment as { method: string }).method === 'pix' ? 'PIX' : 'Cartão';
    // IMPORTANTE: await de propósito — ver nota em create-pix/route.ts
    // sobre CPU throttling do Cloud Run em chamadas fire-and-forget.
    await notifySeller({
      title: 'Pagamento confirmado 🎉',
      body: `${summarizeOrderItems((order.items ?? []) as { productName: string; quantity: number }[])} · ${formatCurrency(order.totalCents as number)} · ${payMethodLabel}`,
      url: `/painel/pedidos/${orderId}`,
      data: { orderId, event: 'payment_confirmed' },
    });

    // ── Email de confirmação ao cliente ───────────────────────────────────
    // Fora do batch (best-effort — falha de email não reverte o pedido)
    try {
      const userSnap = await adminDb.collection('users').doc(order.userId as string).get();
      const userData = userSnap.data() ?? {};
      const customerName  = (userData.name ?? userData.displayName ?? 'Cliente') as string;

      // Tenta email do Firestore primeiro; cai para Firebase Auth como fallback
      let customerEmail = userData.email as string | undefined;
      if (!customerEmail) {
        try {
          const authUser = await adminAuth.getUser(order.userId as string);
          customerEmail = authUser.email;
        } catch {
          console.warn(`[webhook] não foi possível obter email do Auth para uid=${order.userId}`);
        }
      }

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

  if (eventType === 'transparent.expired') {
    // PIX expirou — marca o pedido como payment_expired e libera reserva de estoque
    const transparent = data.transparent;
    const orderId = transparent.externalId as string | undefined;
    if (orderId) {
      const orderRef = adminDb.collection('orders').doc(orderId);
      const orderSnap = await orderRef.get();
      if (orderSnap.exists && orderSnap.data()!.status === 'pending_payment') {
        const order = orderSnap.data()!;
        const now = new Date().toISOString();
        await orderRef.update({
          status: 'payment_expired',
          updatedAt: FieldValue.serverTimestamp(),
          timeline: FieldValue.arrayUnion({
            status: 'payment_expired',
            at: now,
            note: 'PIX expirou sem pagamento',
          }),
        });
        // Liberar reserva de estoque para os itens do pedido expirado
        for (const item of order.items as Array<{ sku: string; quantity: number }>) {
          const invSnap = await adminDb.collection('inventory').where('sku', '==', item.sku).limit(1).get();
          if (!invSnap.empty) {
            adminDb.collection('inventory').doc(invSnap.docs[0].id).update({
              reserved: FieldValue.increment(-item.quantity),
              updatedAt: FieldValue.serverTimestamp(),
            }).catch(() => {});
          }
        }
        console.log(`Order ${orderId} marked as payment_expired, stock reservation released`);

        // ── E-mail: PIX expirou, gere um novo ─────────────────────────────
        try {
          const userSnap = await adminDb.collection('users').doc(order.userId as string).get();
          const userData = userSnap.data() ?? {};
          const customerName = (userData.name ?? userData.displayName ?? 'Cliente') as string;
          let customerEmail = userData.email as string | undefined;
          if (!customerEmail) {
            try {
              const authUser = await adminAuth.getUser(order.userId as string);
              customerEmail = authUser.email;
            } catch { /* sem email */ }
          }

          if (customerEmail) {
            const shortId  = orderId.slice(-8).toUpperCase();
            const orderUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mikma.com.br'}/pedidos/${orderId}`;
            const total    = formatCurrency(order.totalCents as number);

            await sendEmail({
              to: customerEmail,
              subject: `PIX expirado — gere um novo para o pedido #${shortId}`,
              text: [
                `Olá, ${customerName}.`,
                '',
                `O tempo para pagamento do pedido #${shortId} (${total}) expirou.`,
                '',
                'Mas não se preocupe — você ainda tem tempo para pagar. Acesse seu pedido e gere um novo código PIX.',
                '',
                `Acessar pedido: ${orderUrl}`,
                '',
                'O pedido será cancelado automaticamente se não for pago em 48h após a criação.',
                '',
                '— Mikma Lençóis',
              ].join('\n'),
              html: `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;">
  <tr><td style="padding:0 0 20px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><span style="font-family:Georgia,serif;font-size:20px;color:#1E1208;letter-spacing:0.04em;">Mikma Lençóis</span></td>
      <td align="right"><span style="font-size:10px;color:#B09C8C;letter-spacing:0.15em;text-transform:uppercase;">Blumenau, SC</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:36px;border-top:3px solid #C4714A;">
    <p style="margin:0 0 6px;font-size:18px;font-weight:bold;color:#1E1208;">PIX expirado</p>
    <p style="margin:0 0 20px;font-size:14px;color:#705A48;line-height:1.65;">
      Olá, ${customerName}. O tempo de pagamento do pedido <strong>#${shortId}</strong> (${total}) expirou.
    </p>
    <p style="margin:0 0 28px;font-size:14px;color:#705A48;line-height:1.65;">
      Sem problemas — você pode gerar um novo código PIX e concluir o pagamento.
      O pedido só será cancelado após <strong>48 horas</strong> da criação.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${orderUrl}" style="display:inline-block;background:#1E1208;color:#FAF8F5;font-family:Georgia,serif;font-size:14px;text-decoration:none;padding:14px 36px;letter-spacing:0.04em;">
        Gerar novo PIX
      </a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:20px 0 0;">
    <p style="margin:0;font-size:11px;color:#B09C8C;text-align:center;line-height:1.7;">
      Dúvidas? Responda este e-mail ou acesse <a href="https://mikma.com.br" style="color:#C4714A;text-decoration:none;">mikma.com.br</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
            }).catch((err) => {
              console.error('[webhook] falha ao enviar email PIX expirado:', err);
            });
          }
        } catch (emailErr) {
          console.error('[webhook] erro ao processar email PIX expirado:', emailErr);
        }
      }
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
