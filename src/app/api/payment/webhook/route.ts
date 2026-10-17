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
import { buildPixExpired } from '@/lib/email/orderStatusEmails';
import { CONTACT_EMAIL } from '@/lib/email/layout';


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
          // Expiração de um PIX ANTIGO: o cliente gerou um novo ("Pagar
          // agora") e o pedido aponta pro txId novo. Sem esta checagem, o
          // aviso do PIX velho expirava o pedido e liberava o estoque com o
          // PIX novo ainda válido; pago, ele era ignorado (pedido não estava
          // mais pending_payment) e o dinheiro entrava sem pedido pago.
          const expiredTxId = transparent.id as string | undefined;
          if (expiredTxId && data.payment?.txId && expiredTxId !== data.payment.txId) return null;

          // Leituras antes das escritas; SKU sem documento de estoque é
          // pulado em vez de derrubar a transação inteira.
          const lines = expandStockLines(data.items as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>);
          const invRefs = lines.map(line => adminDb.collection('inventory').doc(line.sku));
          const invSnaps = invRefs.length > 0 ? await tx.getAll(...invRefs) : [];

          tx.update(orderRef, {
            status: 'payment_expired',
            updatedAt: FieldValue.serverTimestamp(),
            timeline: FieldValue.arrayUnion({
              status: 'payment_expired',
              at: now,
              note: 'PIX expirou sem pagamento',
            }),
          });

          lines.forEach((line, i) => {
            if (!invSnaps[i].exists) return;
            tx.update(invRefs[i], {
              reserved: FieldValue.increment(-line.quantity),
              updatedAt: FieldValue.serverTimestamp(),
            });
          });

          return data;
        });
      } catch (err) {
        console.error(`Failed to expire order ${orderId}:`, err);
        Sentry.captureException(err, { tags: { route: 'payment-webhook', step: 'expire-order' }, extra: { orderId } });
        return NextResponse.json({ error: 'Falha ao expirar pedido' }, { status: 500 });
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
            const payload = buildPixExpired({ id: orderId, totalCents: order.totalCents as number }, customerName);
            await sendEmail({
              to: customerEmail,
              subject: payload.subject,
              text: payload.text,
              html: payload.html,
              from: 'noreply',
              replyTo: CONTACT_EMAIL,
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

    try {
      await confirmOrderPaid(orderId, txId, `PIX confirmado · txId: ${txId.slice(-8)}`);
    } catch {
      // Falha transitória (contenção, timeout): 500 faz a AbacatePay
      // reenviar o evento. confirmOrderPaid é idempotente.
      return NextResponse.json({ error: 'Falha ao confirmar pagamento' }, { status: 500 });
    }
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

    try {
      await confirmOrderPaid(orderId, txId, `Cartão confirmado · checkoutId: ${txId.slice(-8)}`);
    } catch {
      // Falha transitória (contenção, timeout): 500 faz a AbacatePay
      // reenviar o evento. confirmOrderPaid é idempotente.
      return NextResponse.json({ error: 'Falha ao confirmar pagamento' }, { status: 500 });
    }
  }

  // Always 200 for other event types (transparent.refunded, subscription.*, etc.)
  return NextResponse.json({ ok: true });
}
