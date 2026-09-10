export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';
import { getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { expandStockLines } from '@/lib/orderStockLines';
import { confirmOrderPaid } from '@/lib/orders/confirmPayment';
import { z } from 'zod';
import { webhookSchema } from './schema';


const ABACATEPAY_WEBHOOK_SECRET = process.env.ABACATEPAY_WEBHOOK_SECRET!;

function verifySignature(payload: string, signature: string): boolean {
  if (!ABACATEPAY_WEBHOOK_SECRET) return false;
  try {
    const expected = createHmac('sha256', ABACATEPAY_WEBHOOK_SECRET)
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
  // Defesa contra flood, a AbacatePay manda poucos eventos por transação
  // em operação normal; isso só protege contra abuso/DoS na URL pública.
  const ip = getClientIp(req);
  if (!await rateLimit(`payment-webhook-ip:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-abacatepay-signature') ?? '';

  if (!verifySignature(rawBody, signature)) {
    console.warn('Invalid webhook signature, received:', signature.slice(0, 20));
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

  // Confirmação de pagamento (transação + estoque + notificações + email)
  // vive em src/lib/orders/confirmPayment.ts, compartilhada com a
  // confirmação manual do painel (/api/orders/[id]/mark-paid-manually).

  if (eventType === 'transparent.expired') {
    // PIX expirou, marca o pedido como payment_expired e libera reserva de
    // estoque. IMPORTANTE: tudo isso precisa acontecer na MESMA transação
    // que confere o status atual, pelo mesmo motivo do confirmOrder acima -
    // sem isso, se esse evento de expiração chegar perto de um evento de
    // pagamento confirmado (webhook duplicado/atrasado, comum em gateways
    // de pagamento), dava pra marcar como "expirado" e liberar o estoque de
    // um pedido que na verdade FOI PAGO, overselling do item liberado, e o
    // cliente vendo o próprio pedido pago aparecer como expirado.
    const transparent = data.transparent;
    const orderId = transparent.externalId as string | undefined;
    if (orderId) {
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
            status: 'payment_expired',
            updatedAt: FieldValue.serverTimestamp(),
            timeline: FieldValue.arrayUnion({
              status: 'payment_expired',
              at: now,
              note: 'PIX expirou sem pagamento',
            }),
          });

          for (const line of expandStockLines(data.items as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>)) {
            tx.update(adminDb.collection('inventory').doc(line.sku), {
              reserved: FieldValue.increment(-line.quantity),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }

          return data;
        });
      } catch (err) {
        console.error(`Failed to expire order ${orderId}:`, err);
        Sentry.captureException(err, { tags: { route: 'payment-webhook', step: 'expire-order' }, extra: { orderId } });
        order = null;
      }

      if (order) {
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
              subject: `PIX expirado, gere um novo para o pedido #${shortId}`,
              text: [
                `Olá, ${customerName}.`,
                '',
                `O tempo para pagamento do pedido #${shortId} (${total}) expirou.`,
                '',
                'Mas não se preocupe, você ainda tem tempo para pagar. Acesse seu pedido e gere um novo código PIX.',
                '',
                `Acessar pedido: ${orderUrl}`,
                '',
                'O pedido será cancelado automaticamente se não for pago em 48h após a criação.',
                '',
                'Mikma Lençóis',
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
      Sem problemas, você pode gerar um novo código PIX e concluir o pagamento.
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
      console.error('transparent.completed missing externalId, txId:', txId);
      return NextResponse.json({ ok: true });
    }

    await confirmOrderPaid(orderId, txId, `PIX confirmado · txId: ${txId.slice(-8)}`);
  }

  if (eventType === 'checkout.completed') {
    // Card checkout, data envelope has { checkout: { id, externalId, ... } }
    const checkoutData = (data as Record<string, unknown>).checkout as Record<string, unknown> | undefined;
    const txId = (checkoutData?.id ?? '') as string;
    const orderId = checkoutData?.externalId as string | undefined;

    if (!orderId) {
      console.error('checkout.completed missing externalId, txId:', txId);
      return NextResponse.json({ ok: true });
    }

    await confirmOrderPaid(orderId, txId, `Cartão confirmado · checkoutId: ${txId.slice(-8)}`);
  }

  // Always 200 for other event types (transparent.refunded, subscription.*, etc.)
  return NextResponse.json({ ok: true });
}
