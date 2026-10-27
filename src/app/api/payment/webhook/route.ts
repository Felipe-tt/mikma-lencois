export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verifyAbacateWebhook } from '@/lib/abacatepayWebhook';
import { notifySeller } from '@/lib/push/notifySeller';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { confirmOrderPaid } from '@/lib/orders/confirmPayment';
import { expirePixOrder } from '@/lib/orders/expirePixOrder';
import { notifyOrderRefunded } from '@/lib/email/cancelledEmail';
import { webhookSchema } from './schema';


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
  // Limite antes da verificação (barato). 64 KB: eventos de checkout trazem
  // itens e cliente; os 8 KB de antes podiam recusar um webhook legítimo.
  if (rawBody.length > 65_536) {
    return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 });
  }

  // Aceita os esquemas de assinatura da API v2 (Standard Webhooks e o legado
  // com ?webhookSecret=) e o formato que a loja já usava. Ver o lib.
  const verification = verifyAbacateWebhook(rawBody, req.headers, req.nextUrl.searchParams, process.env.ABACATEPAY_WEBHOOK_SECRET);
  if (!verification.ok) {
    console.warn('[webhook] assinatura recusada:', verification.reason);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  // Standard Webhooks manda o nome do evento em `type` (legado: `event`).
  if (typeof parsed.event !== 'string' && typeof parsed.type === 'string') parsed.event = parsed.type;

  const validated = webhookSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn('Webhook payload inválido:', validated.error.issues[0]?.message);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { event: eventType, data } = validated.data as {
    event: string;
    data: { transparent: Record<string, unknown>; customer?: Record<string, unknown>; reason?: string };
  };

  // Id da entrega: reenvios automáticos repetem o mesmo, então serve de
  // chave para não processar duas vezes (alertas de estorno e disputa não
  // são idempotentes por si). Só é gravado depois do sucesso.
  const deliveryId = verification.deliveryId ?? (typeof parsed.id === 'string' ? parsed.id : null);
  const deliveryRef = deliveryId ? adminDb.collection('webhook_deliveries').doc(deliveryId.replace(/[^\w-]/g, '_').slice(0, 120)) : null;
  if (deliveryRef && (await deliveryRef.get()).exists) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  console.log('Webhook received:', eventType);

  // Confirmação de pagamento (transação + estoque + notificações + email)
  // vive em src/lib/orders/confirmPayment.ts, compartilhada com a
  // confirmação manual do painel (/api/orders/[id]/mark-paid-manually).

  // A v2 da API não manda mais `transparent.expired` (não está na lista de
  // eventos de @abacatepay/types). Fica por compatibilidade; quem expira o
  // PIX hoje é a checagem em /api/orders/[id]/check-payment e o cron.
  if (eventType === 'transparent.expired') {
    const orderId = data.transparent.externalId as string | undefined;
    if (orderId) {
      try {
        await expirePixOrder(orderId, data.transparent.id as string | undefined, 'PIX expirou sem pagamento');
      } catch (err) {
        console.error(`Failed to expire order ${orderId}:`, err);
        Sentry.captureException(err, { tags: { route: 'payment-webhook', step: 'expire-order' }, extra: { orderId } });
        return NextResponse.json({ error: 'Falha ao expirar pedido' }, { status: 500 });
      }
    }
  }

  if (eventType === 'transparent.completed') {
    const transparent = data.transparent;
    const txId = transparent.id as string;
    const orderId = chargeOrderId(transparent);

    if (!orderId) {
      console.error('transparent.completed missing externalId, txId:', txId);
      return NextResponse.json({ ok: true });
    }

    try {
      const label = txId.startsWith('card_') ? 'Cartão aprovado' : 'PIX confirmado';
      await confirmOrderPaid(orderId, txId, `${label} · txId: ${txId.slice(-8)}`, undefined, chargePaidCents(transparent));
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
      await confirmOrderPaid(orderId, txId, `Cartão confirmado · checkoutId: ${txId.slice(-8)}`, undefined, chargePaidCents(checkoutData));
    } catch {
      // Falha transitória (contenção, timeout): 500 faz a AbacatePay
      // reenviar o evento. confirmOrderPaid é idempotente.
      return NextResponse.json({ error: 'Falha ao confirmar pagamento' }, { status: 500 });
    }
  }

  // Always 200 for other event types (transparent.refunded, subscription.*, etc.)
  // ── Estorno feito (pelo painel ou direto na AbacatePay) ────────────────
  if (eventType === 'transparent.refunded' || eventType === 'checkout.refunded') {
    const charge = (eventType === 'transparent.refunded' ? data.transparent : (data as Record<string, unknown>).checkout) as Record<string, unknown> | undefined;
    const orderId = chargeOrderId(charge);
    if (orderId) {
      try {
        await markOrderRefunded(orderId, (charge?.id as string) ?? '', data.reason);
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'payment-webhook', step: 'refunded' }, extra: { orderId } });
        return NextResponse.json({ error: 'Falha ao registrar estorno' }, { status: 500 });
      }
    }
  }

  // ── Contestação (chargeback/MED): aberta, ganha ou perdida ───────────────
  if (eventType === 'transparent.disputed' || eventType === 'checkout.disputed') {
    const charge = (eventType === 'transparent.disputed' ? data.transparent : (data as Record<string, unknown>).checkout) as Record<string, unknown> | undefined;
    const orderId = chargeOrderId(charge);
    if (orderId) {
      try {
        await recordDispute(orderId, String(charge?.status ?? ''), data.reason);
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'payment-webhook', step: 'disputed' }, extra: { orderId } });
        return NextResponse.json({ error: 'Falha ao registrar contestação' }, { status: 500 });
      }
    }
  }

  if (deliveryRef) {
    await deliveryRef.set({ event: eventType, at: FieldValue.serverTimestamp() }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

// Pedido da cobrança: PIX e página da AbacatePay levam externalId; o cartão
// no próprio site ignora externalId e leva o pedido em metadata.orderId.
function chargeOrderId(charge: Record<string, unknown> | undefined): string | undefined {
  if (!charge) return undefined;
  if (typeof charge.externalId === 'string' && charge.externalId) return charge.externalId;
  const meta = charge.metadata as Record<string, unknown> | undefined;
  return typeof meta?.orderId === 'string' && meta.orderId ? meta.orderId : undefined;
}

// Valor recebido segundo o evento (centavos), quando ele traz.
function chargePaidCents(charge: Record<string, unknown> | undefined): number | undefined {
  const v = charge?.paidAmount ?? charge?.amount;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// Registra o estorno no pedido. Se a loja cancelou e marcou o estorno como
// pendente, fecha a pendência; se o estorno veio direto da AbacatePay num
// pedido ainda ativo, avisa o vendedor (o pedido não é cancelado sozinho:
// pode já ter sido enviado).
async function markOrderRefunded(orderId: string, chargeId: string, reason?: string) {
  const ref = adminDb.collection('orders').doc(orderId);
  const order = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const o = snap.data()!;
    if ((o.payment as { refundStatus?: string } | undefined)?.refundStatus === 'done') return null;
    tx.update(ref, {
      'payment.refundStatus': 'done',
      'payment.refundedAt': FieldValue.serverTimestamp(),
      'payment.refundedBy': 'abacatepay',
      'payment.refundChargeId': chargeId,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: o.status,
        at: new Date().toISOString(),
        note: `Estorno confirmado pela AbacatePay${reason && reason !== 'Refund completed' ? ` · ${reason.slice(0, 200)}` : ''}`,
      }),
    });
    return o;
  });
  if (!order) return;
  // Estorno chegou primeiro aqui (feito na AbacatePay): avisa o cliente. Pelo
  // painel o pedido já fica "done" antes, então não sai e-mail em dobro.
  await notifyOrderRefunded(orderId, order, true);
  if (order.status === 'cancelled') return;
  const code = orderId.slice(-8).toUpperCase();
  await adminDb.collection('notifications').doc('seller').collection('items').doc().set({
    type: 'refund',
    orderId,
    message: `O pagamento do pedido #${code} foi estornado na AbacatePay, mas o pedido continua ativo. Confira antes de enviar.`,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  }).catch(() => {});
  await notifySeller({
    title: 'Pagamento estornado',
    body: `#${code} · ${formatCurrency(order.totalCents as number)} · pedido ainda ativo`,
    url: `/painel/pedidos/${orderId}`,
    data: { orderId, event: 'refunded' },
  });
}

// Contestação: UNDER_DISPUTE (aberta), PAID/APPROVED (ganha), REFUNDED (perdida).
async function recordDispute(orderId: string, chargeStatus: string, reason?: string) {
  const state = chargeStatus === 'UNDER_DISPUTE' ? 'open' : chargeStatus === 'REFUNDED' ? 'lost' : 'won';
  const label = state === 'open' ? 'Contestação aberta pelo cliente' : state === 'lost' ? 'Contestação perdida: valor devolvido ao cliente' : 'Contestação encerrada a favor da loja';
  const ref = adminDb.collection('orders').doc(orderId);
  const order = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const o = snap.data()!;
    tx.update(ref, {
      'payment.dispute': { state, reason: (reason ?? '').slice(0, 300), at: new Date().toISOString() },
      ...(state === 'lost' ? { 'payment.refundStatus': 'done', 'payment.refundedAt': FieldValue.serverTimestamp(), 'payment.refundedBy': 'contestacao' } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: o.status,
        at: new Date().toISOString(),
        note: `${label}${reason && reason !== 'Dispute created' ? ` · ${reason.slice(0, 200)}` : ''}`,
      }),
    });
    return o;
  });
  if (!order) return;
  const code = orderId.slice(-8).toUpperCase();
  if (state === 'open') {
    Sentry.captureMessage('payment-webhook: contestação aberta', { level: 'warning', extra: { orderId } });
  }
  await adminDb.collection('notifications').doc('seller').collection('items').doc().set({
    type: 'dispute',
    orderId,
    message: `${label} no pedido #${code}.${state === 'open' ? ' Não envie até resolver; responda pela AbacatePay.' : ''}`,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  }).catch(() => {});
  await notifySeller({
    title: label,
    body: `#${code} · ${formatCurrency(order.totalCents as number)}`,
    url: `/painel/pedidos/${orderId}`,
    data: { orderId, event: 'disputed' },
  });
}
