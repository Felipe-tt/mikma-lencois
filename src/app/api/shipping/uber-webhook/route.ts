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
import { notifySeller }                 from '@/lib/push/notifySeller';
import { notifyInApp }                  from '@/lib/push/notifyInApp';
import { summarizeOrderItems }          from '@/lib/push/summarizeOrderItems';
import { notifyCustomerDeliveryStatus } from '@/lib/email/deliveryStatusEmail';
import { getClientIp }                  from '@/lib/security';
import { rateLimit }                    from '@/lib/rateLimit';
import { getSettings }                  from '@/lib/settings';
import { geocodeCep }                   from '@/lib/shipping-pricing';
import { fetchRoute }                   from '@/lib/routing';
import { z }                            from 'zod';
import { uberWebhookSchema } from './schema';


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

// Nem todo status vira notificação — só os que exigem atenção/ação do
// seller (chegou pra coletar, terminou, ou deu problema). "pickup_complete"
// e "dropoff" ficam só no histórico pra não empilhar push demais no
// celular pra cada micro-atualização da corrida.
const PUSH_ON_STATUS: Record<string, (itemsSummary: string) => { title: string; body: string }> = {
  pickup: (itemsSummary) => ({
    title: 'Motoboy a caminho da loja 🛵',
    body: `Uber Direct já está indo buscar: ${itemsSummary}. Deixa separado!`,
  }),
  delivered: (itemsSummary) => ({
    title: 'Entrega concluída ✅',
    body: `${itemsSummary} foi entregue pelo Uber Direct.`,
  }),
  canceled: (itemsSummary) => ({
    title: 'Entrega Uber Direct cancelada ⚠️',
    body: `Precisa despachar de novo: ${itemsSummary}`,
  }),
  returned: (itemsSummary) => ({
    title: 'Pacote devolvido pelo Uber Direct ⚠️',
    body: `${itemsSummary} voltou pra loja — confira o pedido.`,
  }),
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

/**
 * Calcula a rota loja→cliente (seguindo as ruas) e salva no pedido, mas só
 * na primeira vez — a rota em si não muda durante a entrega, só a posição
 * do motoboy ao longo dela. Chamado tanto no primeiro courier_update quanto
 * na primeira mudança de status pra "pickup", o que vier primeiro.
 * Best-effort: se a geocodificação ou o ORS falhar, simplesmente não seta
 * routePoints — o mapa cai pro fallback de linha reta.
 */
async function ensureRoutePoints(
  orderRef: FirebaseFirestore.DocumentReference,
  orderData: FirebaseFirestore.DocumentData,
  vehicleType?: string
): Promise<void> {
  if (orderData.delivery?.routePoints?.length) return; // já calculada

  const cep = orderData.address?.cep as string | undefined;
  if (!cep) return;

  try {
    const [settings, destCoords] = await Promise.all([
      getSettings(),
      geocodeCep(cep),
    ]);
    if (!destCoords || !settings.originLat || !settings.originLng) return;

    const routePoints = await fetchRoute(
      { lat: settings.originLat, lng: settings.originLng },
      destCoords,
      vehicleType
    );
    if (routePoints && routePoints.length > 0) {
      await orderRef.update({ 'delivery.routePoints': routePoints });
    }
  } catch (err) {
    console.warn('[uber-webhook] falha ao calcular rota (best-effort, ignorado):', err);
  }
}

export async function POST(req: NextRequest) {
  // Defesa contra flood — a Uber manda poucos eventos por corrida em
  // operação normal; isso só protege contra abuso/DoS na URL pública.
  const ip = getClientIp(req);
  if (!rateLimit(`uber-webhook-ip:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

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

  const validated = uberWebhookSchema.safeParse(payload);
  if (!validated.success) {
    console.warn('[uber-webhook] payload inválido:', validated.error.issues[0]?.message);
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  payload = validated.data;

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
      update['delivery.courierLat']           = null;
      update['delivery.courierLng']           = null;
      update['delivery.routePoints']          = null;
    }

    await orderRef.update(update);
    console.log(`[uber-webhook] ${orderRef.id}: ${uberStatus} → ${newStatus}`);

    if (uberStatus === 'pickup') {
      await ensureRoutePoints(orderRef, orderData, courierInStatus?.vehicle_type as string | undefined);
    }

    const pushBuilder = PUSH_ON_STATUS[uberStatus];
    if (pushBuilder) {
      const items = (orderData.items ?? []) as { productName: string; quantity: number }[];
      const { title, body } = pushBuilder(summarizeOrderItems(items));
      // Best-effort — notifySeller nunca lança, só loga falha internamente.
      await notifySeller({
        title,
        body,
        url: `/painel/pedidos/${orderRef.id}`,
        data: { orderId: orderRef.id, event: `uber_${uberStatus}` },
      });
      const IN_APP_TYPE: Record<string, 'uber_pickup' | 'uber_delivered' | 'uber_problem'> = {
        pickup: 'uber_pickup', delivered: 'uber_delivered', canceled: 'uber_problem', returned: 'uber_problem',
      };
      await notifyInApp({
        type: IN_APP_TYPE[uberStatus],
        message: `${title}: ${body}`,
        orderId: orderRef.id,
        url: `/painel/pedidos/${orderRef.id}`,
      });
    }

    // Cliente só precisa saber quando sai pra entrega, chega, ou dá problema
    // — "pending"/"pickup"/"dropoff" ainda estão dentro do fluxo esperado e
    // encher a caixa de entrada dele com cada micro-status não ajuda.
    if (uberStatus === 'pickup_complete' || uberStatus === 'delivered' || uberStatus === 'canceled' || uberStatus === 'returned') {
      await notifyCustomerDeliveryStatus(orderRef.id, orderData as { userId?: string; customerName?: string; customerEmail?: string }, uberStatus);
    }

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
    if (courier.vehicle_type) update['delivery.courierVehicle'] = courier.vehicle_type;

    // Posição ao vivo — chega a cada ~20s enquanto o motoboy está a
    // caminho. É o que alimenta o pino que se move no mapa embutido.
    const location = courier.location as { lat?: number; lng?: number } | undefined;
    if (typeof location?.lat === 'number' && typeof location?.lng === 'number') {
      update['delivery.courierLat']        = location.lat;
      update['delivery.courierLng']        = location.lng;
      update['delivery.courierLocationAt'] = new Date().toISOString();
    }

    // ETAs atualizados — em courier_update o ETA vem no top-level do objeto data
    if (data?.dropoff_eta) update['delivery.dropoffEta'] = data.dropoff_eta;
    if (data?.pickup_eta)  update['delivery.pickupEta']  = data.pickup_eta;

    await orderRef.update(update);
    console.log(`[uber-webhook] ${orderRef.id}: courier_update — ${courier.name ?? '?'}`);

    await ensureRoutePoints(orderRef, orderData, courier.vehicle_type as string | undefined);

    return NextResponse.json({ ok: true });
  }

  // Evento desconhecido — retorna 200 para o Uber não retentar
  return NextResponse.json({ ok: true });
}
