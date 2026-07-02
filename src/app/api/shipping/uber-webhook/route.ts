/**
 * POST /api/shipping/uber-webhook
 * Recebe eventos de status da API Uber Direct e atualiza o pedido no Firestore.
 *
 * Configurar no developer.uber.com → seu app → Webhooks:
 *   URL:    https://mikma.com.br/api/shipping/uber-webhook
 *   Events: delivery.status.changed
 *   Copiar o "Signing Secret" e salvar em UBER_DIRECT_WEBHOOK_SECRET
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminDb }                     from '@/lib/firebase/admin';
import { FieldValue }                  from 'firebase-admin/firestore';

// Mapeamento status Uber Direct → status interno do pedido
const STATUS_MAP: Record<string, string> = {
  pending:          'shipped',    // entrega criada, procurando entregador
  pickup:           'shipped',    // entregador a caminho da loja
  pickup_complete:  'shipped',    // entregador saiu com o pacote
  dropoff:          'shipped',    // entregador a caminho do cliente
  delivered:        'delivered',  // entregue
  cancelled:        'preparing',  // cancelado — volta para "preparando"
  returned:         'preparing',  // devolvido — volta para "preparando"
};

const STATUS_LABEL: Record<string, string> = {
  pending:          'Procurando entregador (Uber Direct)',
  pickup:           'Entregador a caminho da loja (Uber Direct)',
  pickup_complete:  'Entregador saiu com o pacote (Uber Direct)',
  dropoff:          'Entregador a caminho do cliente (Uber Direct)',
  delivered:        'Entregue via Uber Direct',
  cancelled:        'Entrega Uber Direct cancelada',
  returned:         'Pacote devolvido pelo Uber Direct',
};

/** Verifica assinatura HMAC-SHA256 do Uber Direct */
function verifySignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.UBER_DIRECT_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[uber-webhook] UBER_DIRECT_WEBHOOK_SECRET não configurado — pulando verificação');
    return true; // permissivo em dev; em prod a variável deve estar setada
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(
      Buffer.from(signature.replace(/^sha256=/, ''), 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = Buffer.from(await req.arrayBuffer());

  // Uber Direct pode enviar o header como X-Postmates-Signature ou X-Uber-Signature
  const sig =
    req.headers.get('x-postmates-signature') ??
    req.headers.get('x-uber-signature') ??
    '';

  if (!verifySignature(rawBody, sig)) {
    console.warn('[uber-webhook] assinatura inválida');
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Estrutura do evento Uber Direct:
  // { event_type, resource_id, customer_id, data: { id, status, tracking_url, ... } }
  const eventType  = payload.event_type as string | undefined;
  const data       = payload.data       as Record<string, unknown> | undefined;

  if (eventType !== 'delivery.status.changed' || !data) {
    // Ignora eventos que não nos interessam (retorna 200 para o Uber não retentar)
    return NextResponse.json({ ok: true });
  }

  const deliveryId  = data.id          as string | undefined;
  const uberStatus  = data.status      as string | undefined;
  const trackingUrl = data.tracking_url as string | undefined;

  if (!deliveryId || !uberStatus) {
    return NextResponse.json({ error: 'missing delivery id or status' }, { status: 400 });
  }

  // Busca o pedido pelo uberDirectDeliveryId
  const snap = await adminDb
    .collection('orders')
    .where('delivery.uberDirectDeliveryId', '==', deliveryId)
    .limit(1)
    .get();

  if (snap.empty) {
    // Pode acontecer em testes do painel do Uber — não é erro crítico
    console.warn('[uber-webhook] pedido não encontrado para deliveryId:', deliveryId);
    return NextResponse.json({ ok: true });
  }

  const orderRef  = snap.docs[0].ref;
  const orderData = snap.docs[0].data();

  // Evita sobrescrever com um status "atrás" (ex: eventos chegarem fora de ordem)
  const currentStatus = orderData.status as string | undefined;
  const newStatus     = STATUS_MAP[uberStatus] ?? currentStatus;

  // Se já está "delivered" não regride para "shipped" por eventos atrasados
  if (currentStatus === 'delivered' && newStatus !== 'delivered') {
    return NextResponse.json({ ok: true });
  }

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    timeline:  FieldValue.arrayUnion({
      status: newStatus,
      at:     new Date().toISOString(),
      note:   STATUS_LABEL[uberStatus] ?? `Uber Direct: ${uberStatus}`,
    }),
  };

  if (newStatus && newStatus !== currentStatus) {
    update.status = newStatus;
  }

  if (trackingUrl) {
    update['delivery.trackingUrl'] = trackingUrl;
  }

  // Se entregue, registra data de entrega
  if (uberStatus === 'delivered') {
    update['delivery.deliveredAt'] = FieldValue.serverTimestamp();
  }

  // Se cancelado/devolvido, limpa o deliveryId para permitir novo despacho
  if (uberStatus === 'canceled' || uberStatus === 'returned') {
    update['delivery.carrier']              = null;
    update['delivery.uberDirectDeliveryId'] = null;
    update['delivery.trackingUrl']          = null;
    update['delivery.dispatchedAt']         = null;
  }

  await orderRef.update(update);

  console.log(`[uber-webhook] pedido ${orderRef.id} atualizado: ${uberStatus} → status=${newStatus}`);
  return NextResponse.json({ ok: true });
}
