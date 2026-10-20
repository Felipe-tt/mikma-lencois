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
 * o valor real aqui, se precisar rotacionar, gere um novo no painel
 * do Uber e atualize a env var no Cloud Run.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual }  from 'crypto';
import { adminDb }                      from '@/lib/firebase/admin';
import { FieldValue }                   from 'firebase-admin/firestore';
import { getClientIp }                  from '@/lib/security';
import { rateLimit }                    from '@/lib/rateLimit';
import { uberDirectWebhookSecret }      from '@/lib/uber-direct';
import { applyUberStatus, courierUpdate, ensureRoutePoints, type CourierInfo } from '@/lib/uberDeliverySync';
import { uberWebhookSchema } from './schema';


function verifySignature(rawBody: Buffer, header: string): boolean {
  // Testa contra os dois secrets configurados (produção e sandbox), o
  // toggle de ambiente é por pedido (delivery.uberSandbox), não global, então
  // um webhook de qualquer um dos dois apps pode legitimamente chegar aqui.
  // uberDirectWebhookSecret le do secret consolidado UBER_DIRECT_CREDS/
  // UBER_DIRECT_SANDBOX_CREDS (JSON), com fallback pras vars antigas.
  const secrets = [uberDirectWebhookSecret(false), uberDirectWebhookSecret(true)]
    .filter((s): s is string => !!s);
  if (secrets.length === 0) {
    console.error('[uber-webhook] nenhum UBER_DIRECT_WEBHOOK_SECRET configurado, rejeitando (fail-closed)');
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
  // Defesa contra flood, a Uber manda poucos eventos por corrida em
  // operação normal; isso só protege contra abuso/DoS na URL pública.
  const ip = getClientIp(req);
  if (!await rateLimit(`uber-webhook-ip:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  // Evento da Uber tem poucos KB; corpo gigante é abuso (antes lia tudo).
  if (Number(req.headers.get('content-length') ?? 0) > 64 * 1024) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }
  const rawBody = Buffer.from(await req.arrayBuffer());
  if (rawBody.length > 64 * 1024) return NextResponse.json({ error: 'payload too large' }, { status: 413 });
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

  // BUG CRÍTICO CORRIGIDO: o payload real da Uber Direct usa "kind" pro
  // tipo de evento (ex: "event.delivery_status", "event.courier_update"),
  // não "event_type". Com o nome errado, eventType SEMPRE vinha undefined
  // pra qualquer webhook real da Uber — nenhum status ou posição do
  // entregador nunca chegava a atualizar o pedido, silenciosamente (o
  // webhook só retornava 200 {ok:true} de qualquer jeito, então nunca
  // apareceu como erro pra ninguém notar). Confirmado nos exemplos oficiais:
  // developer.uber.com/docs/deliveries/daas/references/api/webhooks/
  // delivery-status-webhook e .../courier-update-webhook.
  const eventType  = (payload.kind ?? payload.event_type) as string | undefined;
  const data       = payload.data as Record<string, unknown> | undefined;
  const deliveryId = (payload.delivery_id ?? data?.id ?? payload.resource_id) as string | undefined;

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
    // status também vem no nível raiz do payload (payload.status) além de
    // dentro de data, usa os dois como fallback.
    const uberStatus = (data?.status ?? payload.status) as string | undefined;
    if (!uberStatus) return NextResponse.json({ ok: true });

    await applyUberStatus(orderRef, deliveryId, uberStatus, {
      trackingUrl: data?.tracking_url as string | undefined,
      dropoffEta:  data?.dropoff_eta as string | undefined,
      courier:     data?.courier as CourierInfo | undefined,
    });
    return NextResponse.json({ ok: true });
  }

  // ── event.courier_update ──────────────────────────────────────────────────
  if (eventType === 'event.courier_update') {
    const courier = data?.courier as (CourierInfo & { location?: { lat?: number; lng?: number } }) | undefined;
    if (!courier) return NextResponse.json({ ok: true });

    // Posição ao vivo, chega a cada ~20s enquanto o motoboy está a caminho.
    // Vem em payload.location (nível raiz), não em data.courier.location,
    // confirmado no exemplo oficial da Uber (.../courier-update-webhook);
    // data.courier.location fica como fallback.
    const location = (payload.location ?? courier.location) as { lat?: number; lng?: number } | undefined;
    const update = {
      updatedAt: FieldValue.serverTimestamp(),
      ...courierUpdate(courier, location, {
        pickupEta:  data?.pickup_eta as string | undefined,
        dropoffEta: data?.dropoff_eta as string | undefined,
      }),
    };

    await orderRef.update(update);
    console.log(`[uber-webhook] ${orderRef.id}: courier_update, ${courier.name ?? '?'}`);

    await ensureRoutePoints(orderRef, orderData, { vehicleType: courier.vehicle_type });

    return NextResponse.json({ ok: true });
  }

  // Evento desconhecido, retorna 200 para o Uber não retentar
  return NextResponse.json({ ok: true });
}
