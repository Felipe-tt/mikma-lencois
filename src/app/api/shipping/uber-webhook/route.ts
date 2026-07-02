/**
 * POST /api/shipping/uber-webhook
 * Recebe eventos do Uber Direct e sincroniza o pedido no Firestore.
 *
 * Eventos configurados no painel:
 *   event.delivery_status  → atualiza status do pedido (o principal)
 *   event.courier_update   → atualiza info do entregador (nome, ETA)
 *
 * UBER_DIRECT_WEBHOOK_SECRET = 08a17383-8c2b-44b4-b4e9-de07eb2ae50d
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual }  from 'crypto';
import { adminDb }                      from '@/lib/firebase/admin';
import { FieldValue }                   from 'firebase-admin/firestore';

// Status Uber Direct → status interno do pedido
const STATUS_MAP: Record<string, string> = {
  pending:         'shipped',    // criado, procurando entregador
  pickup:          'shipped',    // entregador a caminho da loja
  pickup_complete: 'shipped',    // entregador saiu com o pacote
  dropoff:         'shipped',    // entregador a caminho do cliente
  delivered:       'delivered',
  canceled:        'preparing',  // cancelado → volta para "preparando"
  returned:        'preparing',  // devolvido → volta para "preparando"
};

const STATUS_NOTE: Record<string, string> = {
  pending:         'Procurando entregador (Uber Direct)',
  pickup:          'Entregador a caminho da loja',
  pickup_complete: 'Entregador saiu com o pacote',
  dropoff:         'Entregador a caminho do cliente',
  delivered:       'Entregue via Uber Direct',
  canceled:        'Entrega Uber Direct cancelada',
  returned:        'Pacote devolvido pelo Uber Direct',
};

function verifySignature(rawBody: Buffer, header: string): boolean {
  const secret = process.env.UBER_DIRECT_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[uber-webhook] UBER_DIRECT_WEBHOOK_SECRET não configurado');
    return true; // permissivo enquanto não configurado
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = header.replace(/^sha256=/, '');
  try {
    return timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = Buffer.from(await req.arrayBuffer());
  const sig     = req.headers.get('x-postmates-signature')
                ?? req.headers.get('x-uber-signature')
                ?? '';

  if (!verifySignature(rawBody, sig)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody.toString('utf-8')); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const eventType  = payload.event_type as string | undefined;
  const data       = payload.data       as Record<string, unknown> | undefined;
  const deliveryId = (data?.id ?? payload.resource_id) as string | undefined;

  if (!deliveryId) return NextResponse.json({ ok: true });

  // Busca o pedido pelo deliveryId
  const snap = await adminDb
    .collection('orders')
    .where('delivery.uberDirectDeliveryId', '==', deliveryId)
    .limit(1)
    .get();

  if (snap.empty) {
    console.warn('[uber-webhook] pedido não encontrado para deliveryId:', deliveryId);
    return NextResponse.json({ ok: true });
  }

  const orderRef  = snap.docs[0].ref;
  const orderData = snap.docs[0].data();

  // ── event.delivery_status ─────────────────────────────────────────────────
  if (eventType === 'event.delivery_status') {
    const uberStatus = data?.status as string | undefined;
    if (!uberStatus) return NextResponse.json({ ok: true });

    const newStatus = STATUS_MAP[uberStatus] ?? orderData.status;

    // Não regride de "delivered"
    if (orderData.status === 'delivered' && newStatus !== 'delivered')
      return NextResponse.json({ ok: true });

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      timeline:  FieldValue.arrayUnion({
        status: newStatus,
        at:     new Date().toISOString(),
        note:   STATUS_NOTE[uberStatus] ?? `Uber Direct: ${uberStatus}`,
      }),
    };

    if (newStatus !== orderData.status) update.status = newStatus;
    if (data?.tracking_url)             update['delivery.trackingUrl'] = data.tracking_url;
    if (uberStatus === 'delivered')     update['delivery.deliveredAt'] = FieldValue.serverTimestamp();

    if (uberStatus === 'canceled' || uberStatus === 'returned') {
      update['delivery.carrier']              = null;
      update['delivery.uberDirectDeliveryId'] = null;
      update['delivery.trackingUrl']          = null;
      update['delivery.dispatchedAt']         = null;
    }

    await orderRef.update(update);
    console.log(`[uber-webhook] ${orderRef.id}: ${uberStatus} → ${newStatus}`);
    return NextResponse.json({ ok: true });
  }

  // ── event.courier_update ──────────────────────────────────────────────────
  if (eventType === 'event.courier_update') {
    const courier = data?.courier as Record<string, unknown> | undefined;
    if (!courier) return NextResponse.json({ ok: true });

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (courier.name)         update['delivery.courierName']  = courier.name;
    if (courier.phone_number) update['delivery.courierPhone'] = courier.phone_number;
    if (courier.img_href)     update['delivery.courierPhoto'] = courier.img_href; // img_href conforme OpenAPI CourierInfo

    // ETAs atualizados
    const dropoff = data?.dropoff as Record<string, unknown> | undefined;
    if (dropoff?.eta) update['delivery.dropoffEta'] = dropoff.eta;

    await orderRef.update(update);
    console.log(`[uber-webhook] ${orderRef.id}: courier_update — ${courier.name ?? '?'}`);
    return NextResponse.json({ ok: true });
  }

  // Evento desconhecido — retorna 200 para o Uber não retentar
  return NextResponse.json({ ok: true });
}
