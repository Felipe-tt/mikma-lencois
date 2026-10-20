/**
 * src/lib/uberDeliverySync.ts
 * Aplica no pedido o que a Uber Direct informa sobre a corrida: status,
 * entregador, posição, ETAs e a rota do mapa. Usado pelo webhook e pela
 * sincronização ativa (GET da corrida), que a página do pedido chama
 * enquanto a entrega está em andamento. Assim o mapa e o entregador
 * aparecem no site mesmo quando um webhook se perde ou atrasa.
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { notifySeller } from '@/lib/push/notifySeller';
import { notifyInApp } from '@/lib/push/notifyInApp';
import { summarizeOrderItems } from '@/lib/push/summarizeOrderItems';
import { notifyCustomerDeliveryStatus } from '@/lib/email/deliveryStatusEmail';
import { getSettings } from '@/lib/settings';
import { geocodeCep } from '@/lib/shipping-pricing';
import { fetchRoute, type RoutePoint } from '@/lib/routing';
import { uberGetDelivery } from '@/lib/uber-direct';

type DocRef = FirebaseFirestore.DocumentReference;
type DocData = FirebaseFirestore.DocumentData;

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

// Nem todo status vira notificação, só os que exigem atenção/ação do
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
    body: `${itemsSummary} voltou pra loja, confira o pedido.`,
  }),
};

const IN_APP_TYPE: Record<string, 'uber_pickup' | 'uber_delivered' | 'uber_problem'> = {
  pickup: 'uber_pickup', delivered: 'uber_delivered', canceled: 'uber_problem', returned: 'uber_problem',
};

const ACTIVE_STATUSES = new Set(['pending', 'pickup', 'pickup_complete', 'dropoff']);

export interface CourierInfo {
  name?: string;
  phone_number?: string;
  img_href?: string;
  vehicle_type?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  vehicle_license_plate?: string;
  rating?: number | string;
}

const text = (v: unknown, max = 60) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

function isCoord(p?: { lat?: number; lng?: number } | null): p is RoutePoint {
  return typeof p?.lat === 'number' && typeof p?.lng === 'number'
    && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);
}

// Uma tentativa de rota a cada 10 min no máximo: a sincronização roda a
// cada ~20s e geocodificação/ORS têm cota.
const ROUTE_RETRY_MS = 10 * 60_000;

/**
 * Calcula a rota loja→cliente e salva no pedido, uma vez por entrega (a rota
 * não muda, só o motoboy ao longo dela). Usa as coordenadas que a Uber
 * informa quando vêm na corrida; senão, a origem das configurações e o CEP
 * do cliente. Sem rota pelas ruas (ORS fora do ar ou sem chave), salva a
 * linha reta loja→cliente: o mapa aparece do mesmo jeito.
 * Best-effort, nunca lança.
 */
export async function ensureRoutePoints(
  orderRef: DocRef,
  orderData: DocData,
  opts: { vehicleType?: string; pickup?: RoutePoint | null; dropoff?: RoutePoint | null } = {},
): Promise<void> {
  const delivery = orderData.delivery ?? {};
  const pickup = isCoord(opts.pickup) ? opts.pickup : isCoord(delivery.pickupPoint) ? delivery.pickupPoint as RoutePoint : null;
  const dropoff = isCoord(opts.dropoff) ? opts.dropoff : isCoord(delivery.dropoffPoint) ? delivery.dropoffPoint as RoutePoint : null;
  // Rota feita pelo CEP (aproximado) é refeita quando chegam as coordenadas
  // exatas da Uber; a feita com elas pelas ruas não muda mais.
  if (delivery.routePoints?.length > 1 && (delivery.routeExact || !(pickup && dropoff))) return;
  const exact = !!(pickup && dropoff);
  const lastTry = delivery.routeAttemptAt ? Date.parse(delivery.routeAttemptAt) : 0;
  // A espera entre tentativas não vale quando antes só havia o CEP e agora
  // há as coordenadas da Uber.
  const upgrade = exact && !delivery.routeAttemptExact;
  if (!upgrade && lastTry && Date.now() - lastTry < ROUTE_RETRY_MS) return;

  try {
    await orderRef.update({ 'delivery.routeAttemptAt': new Date().toISOString(), 'delivery.routeAttemptExact': exact });

    let origin = pickup;
    if (!origin) {
      const settings = await getSettings();
      if (settings.originLat && settings.originLng) origin = { lat: settings.originLat, lng: settings.originLng };
    }
    let dest = dropoff;
    const cep = orderData.address?.cep as string | undefined;
    if (!dest && cep) dest = await geocodeCep(cep);
    if (!origin || !dest) return;

    const route = await fetchRoute(origin, dest, opts.vehicleType);
    const routePoints = route && route.length > 1 ? route : [origin, dest];
    await orderRef.update({
      'delivery.routePoints': routePoints,
      'delivery.routeExact': !!(exact && route),
    });
  } catch (err) {
    console.warn('[uber] falha ao calcular rota (best-effort, ignorado):', err);
  }
}

/**
 * Aplica um status da corrida no pedido. A checagem de repetição roda numa
 * transação: webhook e sincronização podem trazer o mesmo status ao mesmo
 * tempo, e só um deles pode disparar e-mail, push e linha na timeline.
 * Retorna true se o status foi aplicado.
 */
export async function applyUberStatus(
  orderRef: DocRef,
  deliveryId: string,
  uberStatus: string,
  extra: { trackingUrl?: string; dropoffEta?: string; courier?: CourierInfo | null } = {},
): Promise<boolean> {
  const before = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(orderRef);
    const order = snap.data();
    if (!order) return null;
    // Corrida antiga (cancelada e redespachada): ignora.
    if (order.delivery?.uberDirectDeliveryId !== deliveryId) return null;

    const newStatus = STATUS_MAP[uberStatus] ?? order.status;

    // Não regride de "delivered"
    if (order.status === 'delivered' && newStatus !== 'delivered') return null;

    // Pedido cancelado no painel fica cancelado: o "canceled" que a Uber
    // manda depois virava "preparing", o pedido voltava pra lista de ativos
    // e podia ser despachado de novo com o estoque já devolvido.
    if (order.status === 'cancelled') return null;

    // Reenvio do mesmo status (a Uber reenvia em caso de timeout) ou
    // "entregue" que chega depois do cliente já ter confirmado: antes
    // repetia e-mail, push, notificação e linha na timeline.
    if (uberStatus === order.delivery?.uberLastStatus || (order.status === 'delivered' && uberStatus === 'delivered')) {
      return null;
    }

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      timeline:  FieldValue.arrayUnion({
        status: newStatus,
        at:     new Date().toISOString(),
        note:   STATUS_NOTE[uberStatus] ?? `Uber Direct: ${uberStatus}`,
      }),
      'delivery.uberLastStatus': uberStatus,
    };

    if (newStatus !== order.status) update.status = newStatus;
    if (extra.trackingUrl)          update['delivery.trackingUrl'] = extra.trackingUrl;
    if (extra.dropoffEta)           update['delivery.dropoffEta']  = extra.dropoffEta;
    if (uberStatus === 'delivered') update['delivery.deliveredAt'] = FieldValue.serverTimestamp();
    // Preenche o entregador se vier junto (nem sempre vem).
    if (extra.courier?.name)         update['delivery.courierName']    = extra.courier.name;
    if (extra.courier?.img_href)     update['delivery.courierPhoto']   = extra.courier.img_href;
    if (extra.courier?.vehicle_type) update['delivery.courierVehicle'] = extra.courier.vehicle_type;

    if (uberStatus === 'canceled' || uberStatus === 'returned') {
      update['delivery.carrier']              = null;
      update['delivery.uberDirectDeliveryId'] = null;
      update['delivery.trackingUrl']          = null;
      update['delivery.dispatchedAt']         = null;
      update['delivery.courierLat']           = null;
      update['delivery.courierLng']           = null;
      update['delivery.routePoints']          = null;
      update['delivery.routeAttemptAt']       = null;
      update['delivery.routeExact']           = null;
      update['delivery.routeAttemptExact']    = null;
      update['delivery.pickupPoint']          = null;
      update['delivery.dropoffPoint']         = null;
      // Entregador da corrida cancelada não pode aparecer na próxima.
      for (const f of ['courierName', 'courierPhone', 'courierPhoto', 'courierVehicle', 'courierCar', 'courierCarColor',
        'courierPlate', 'courierRating', 'courierLocationAt', 'pickupEta', 'dropoffEta', 'uberLastStatus']) {
        update[`delivery.${f}`] = null;
      }
    }

    tx.update(orderRef, update);
    return { order, newStatus };
  });
  if (!before) return false;

  const { order, newStatus } = before;
  console.log(`[uber] ${orderRef.id}: ${uberStatus} → ${newStatus}`);

  if (uberStatus === 'pickup') {
    await ensureRoutePoints(orderRef, order, { vehicleType: extra.courier?.vehicle_type });
  }

  const pushBuilder = PUSH_ON_STATUS[uberStatus];
  if (pushBuilder) {
    const items = (order.items ?? []) as { productName: string; quantity: number }[];
    const { title, body } = pushBuilder(summarizeOrderItems(items));
    // Best-effort, notifySeller nunca lança, só loga falha internamente.
    await notifySeller({
      title,
      body,
      url: `/painel/pedidos/${orderRef.id}`,
      data: { orderId: orderRef.id, event: `uber_${uberStatus}` },
    });
    await notifyInApp({
      type: IN_APP_TYPE[uberStatus],
      message: `${title}: ${body}`,
      orderId: orderRef.id,
      url: `/painel/pedidos/${orderRef.id}`,
    });
  }

  // Cliente só precisa saber quando sai pra entrega, chega, ou dá problema;
  // "pending"/"pickup"/"dropoff" ainda estão dentro do fluxo esperado.
  if (uberStatus === 'pickup_complete' || uberStatus === 'delivered' || uberStatus === 'canceled' || uberStatus === 'returned') {
    await notifyCustomerDeliveryStatus(orderRef.id, order as { userId?: string; customerName?: string; customerEmail?: string }, uberStatus);
  }
  return true;
}

/** Dados do entregador, posição ao vivo e ETAs. */
export function courierUpdate(
  courier: CourierInfo | null | undefined,
  location: { lat?: number; lng?: number } | null | undefined,
  etas: { pickupEta?: string; dropoffEta?: string },
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (courier?.name)         update['delivery.courierName']    = courier.name;
  if (courier?.phone_number) update['delivery.courierPhone']   = courier.phone_number;
  if (courier?.img_href)     update['delivery.courierPhoto']   = courier.img_href;
  if (courier?.vehicle_type) update['delivery.courierVehicle'] = courier.vehicle_type;
  // Carro, cor e placa, como no app da Uber (nem toda conta/veículo manda).
  const make = text(courier?.vehicle_make), model = text(courier?.vehicle_model);
  const color = text(courier?.vehicle_color, 30), plate = text(courier?.vehicle_license_plate, 12);
  if (make || model) update['delivery.courierCar'] = [make, model].filter(Boolean).join(' ');
  if (color)         update['delivery.courierCarColor'] = color;
  if (plate)         update['delivery.courierPlate'] = plate.toUpperCase();
  const rating = Number(courier?.rating);
  if (Number.isFinite(rating) && rating > 0 && rating <= 5) update['delivery.courierRating'] = Math.round(rating * 10) / 10;
  if (isCoord(location)) {
    update['delivery.courierLat']        = location.lat;
    update['delivery.courierLng']        = location.lng;
    update['delivery.courierLocationAt'] = new Date().toISOString();
  }
  if (etas.dropoffEta) update['delivery.dropoffEta'] = etas.dropoffEta;
  if (etas.pickupEta)  update['delivery.pickupEta']  = etas.pickupEta;
  return update;
}

/**
 * Consulta a corrida na Uber e atualiza o pedido. Retorna o status da Uber,
 * ou null se o pedido não tem corrida Uber ativa.
 */
export async function syncUberDelivery(orderId: string): Promise<string | null> {
  const orderRef = adminDb.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  const order = snap.data();
  const deliveryId = order?.delivery?.uberDirectDeliveryId as string | undefined;
  if (!order || order.delivery?.carrier !== 'uber_direct' || !deliveryId) return null;
  if (order.status === 'delivered' || order.status === 'cancelled') return null;

  const d = await uberGetDelivery(deliveryId, !!order.delivery?.uberSandbox);
  const status = d.status ?? '';

  if (status && status !== order.delivery?.uberLastStatus) {
    await applyUberStatus(orderRef, deliveryId, status, {
      trackingUrl: d.tracking_url,
      dropoffEta: d.dropoff_eta,
      courier: d.courier,
    });
  }

  if (ACTIVE_STATUSES.has(status)) {
    const update = courierUpdate(d.courier, d.courier?.location, { pickupEta: d.pickup_eta, dropoffEta: d.dropoff_eta });
    if (d.tracking_url && d.tracking_url !== order.delivery?.trackingUrl) update['delivery.trackingUrl'] = d.tracking_url;
    // Pinos da loja e do cliente exatamente onde a Uber vai coletar e entregar.
    if (isCoord(d.pickup?.location) && !order.delivery?.pickupPoint) {
      update['delivery.pickupPoint'] = { lat: d.pickup.location.lat, lng: d.pickup.location.lng };
    }
    if (isCoord(d.dropoff?.location) && !order.delivery?.dropoffPoint) {
      update['delivery.dropoffPoint'] = { lat: d.dropoff.location.lat, lng: d.dropoff.location.lng };
    }
    if (Object.keys(update).length) {
      // Só grava se a corrida ainda é a mesma (pode ter sido cancelada nesse meio-tempo).
      await adminDb.runTransaction(async tx => {
        const cur = (await tx.get(orderRef)).data();
        if (cur?.delivery?.uberDirectDeliveryId === deliveryId) tx.update(orderRef, update);
      });
    }
    await ensureRoutePoints(orderRef, order, {
      vehicleType: d.courier?.vehicle_type,
      pickup: d.pickup?.location as RoutePoint | undefined,
      dropoff: d.dropoff?.location as RoutePoint | undefined,
    });
  }
  return status || null;
}
