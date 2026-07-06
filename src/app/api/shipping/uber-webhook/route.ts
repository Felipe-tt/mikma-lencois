/**
 * POST /api/shipping/uber-webhook
 * Recebe eventos do Uber Direct e sincroniza o pedido no Firestore.
 *
 * Eventos configurados no painel:
 *   event.delivery_status  → atualiza status do pedido (o principal)
 *   event.courier_update   → atualiza info do entregador (nome, ETA)
 *
 * UBER_DIRECT_WEBHOOK_SECRET configurada como variável de ambiente
 * (painel do Uber Direct → Webhooks → Signing key). Nunca hardcode
 * o valor real aqui — se precisar rotacionar, gere um novo no painel
 * do Uber e atualize a env var no Cloud Run.
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
  // Testa contra os dois secrets configurados (produção e sandbox) — o
  // toggle de ambiente é por pedido (delivery.uberSandbox), não global, então
  // um webhook de qualquer um dos dois apps pode legitimamente chegar aqui.
  const secrets = [process.env.UBER_DIRECT_WEBHOOK_SECRET, process.env.UBER_DIRECT_SANDBOX_WEBHOOK_SECRET]
    .filter((s): s is string => !!s);
  if (secrets.length === 0) {
    console.error('[uber-webhook] nenhum UBER_DIRECT_WEBHOOK_SECRET configurado — rejeitando (fail-closed)');
    return false;
  }
  const received = header.replace(/^sha256=/, '');
  let receivedBuf: Buffer;
  try {
    receivedBuf = Buffer.from(received, 'hex');
  } catch {
    return false;
  }
  return secrets.some(secret => {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return receivedBuf.length === Buffer.from(expected, 'hex').length
        && timingSafeEqual(receivedBuf, Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  });
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
    if (data?.dropoff_eta)              update['delivery.dropoffEta']  = data.dropoff_eta;
    if (uberStatus === 'delivered')     update['delivery.deliveredAt'] = FieldValue.serverTimestamp();
    // Preenche courier se presente no evento (nem sempre vem, mas quando vem aproveita)
    const courierInStatus = data?.courier as Record<string, unknown> | undefined;
    if (courierInStatus?.name)      update['delivery.courierName']  = courierInStatus.name;
    if (courierInStatus?.img_href)  update['delivery.courierPhoto'] = courierInStatus.img_href;
    if (courierInStatus?.vehicle_type) update['delivery.courierVehicle'] = courierInStatus.vehicle_type;

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

    // ETAs atualizados — em courier_update o ETA vem no top-level do objeto data
    if (data?.dropoff_eta) update['delivery.dropoffEta'] = data.dropoff_eta;
    if (data?.pickup_eta)  update['delivery.pickupEta']  = data.pickup_eta;

    await orderRef.update(update);
    console.log(`[uber-webhook] ${orderRef.id}: courier_update — ${courier.name ?? '?'}`);
    return NextResponse.json({ ok: true });
  }

  // Evento desconhecido — retorna 200 para o Uber não retentar
  return NextResponse.json({ ok: true });
}
