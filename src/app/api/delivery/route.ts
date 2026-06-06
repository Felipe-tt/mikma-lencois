export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests } from '@/lib/security';
import type { Order, OrderItem, Address } from '@/types';
import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';

async function getStoreSettings(): Promise<StoreSettings> {
  const snap = await adminDb.collection('settings').doc('store').get();
  return { ...STORE_DEFAULTS, ...(snap.exists ? snap.data() : {}) } as StoreSettings;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeCEP(cep: string): Promise<{ lat: number; lng: number } | null> {
  const clean = cep.replace(/\D/g, '');
  const viaCep = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
  const data = await viaCep.json();
  if (data.erro) return null;
  const query = encodeURIComponent(`${data.logradouro}, ${data.localidade}, ${data.uf}, Brasil`);
  const geo = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
    { headers: { 'User-Agent': `MikmaLencois/1.0 ${process.env.STORE_EMAIL ?? ''}` } }
  );
  const [hit] = await geo.json();
  if (!hit) return null;
  return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
}

async function getBuyerName(userId: string): Promise<string> {
  const snap = await adminDb.collection('users').doc(userId).get();
  return snap.data()?.name ?? 'Cliente';
}

async function dispatchUberDirect(
  orderId: string, address: Address, buyerName: string,
  items: OrderItem[], settings: StoreSettings
): Promise<{ id: string; trackingUrl?: string }> {
  const manifest = items.map(i => `${i.quantity}x ${i.productName}`).join(', ');
  const destAddress = `${address.street}, ${address.number}, ${address.city}, ${address.state}, ${address.cep}`;
  const pickupAddress = [
    settings.storeAddress,
    settings.storeNeighborhood,
    settings.storeCity,
    settings.storeCep,
  ].filter(Boolean).join(', ');

  const res = await fetch(
    `https://api.uber.com/v1/customers/${process.env.UBER_DIRECT_CUSTOMER_ID}/deliveries`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.UBER_DIRECT_API_KEY}` },
      body: JSON.stringify({
        pickup: {
          name: settings.storeName,
          address: pickupAddress,
          phone: settings.storePhone || process.env.STORE_PHONE,
        },
        dropoff: { name: buyerName, address: destAddress },
        manifest: { reference: orderId, description: manifest },
      }),
    }
  );
  if (!res.ok) throw new Error(`Uber Direct: ${await res.text()}`);
  return res.json();
}

async function addToMelhorEnvioCart(
  orderId: string, destCep: string, items: OrderItem[], settings: StoreSettings
): Promise<{ id: string }[]> {
  const totalWeightKg = items.reduce((acc, i) => acc + (settings.defaultItemWeightKg || 0.8) * i.quantity, 0);

  const res = await fetch('https://melhorenvio.com.br/api/v2/me/cart', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
      'User-Agent': `MikmaLencois/1.0 ${settings.storeEmail || ''}`,
    },
    body: JSON.stringify({
      from: { postal_code: settings.originCep.replace(/\D/g, '') },
      to: { postal_code: destCep.replace(/\D/g, '') },
      products: [{ weight: totalWeightKg, width: 40, height: 20, length: 50, quantity: 1 }],
      services: '1,2',
      options: { receipt: false, own_hand: false, tags: [{ tag: orderId, url: null }] },
    }),
  });
  if (!res.ok) throw new Error(`Melhor Envio: ${await res.text()}`);
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1], true);
    if (!['seller', 'admin'].includes((decoded as { role?: string }).role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Rate limit: 30 dispatches/hora por IP
    const ip = getClientIp(req);
    const rlKey = `delivery:${ip}`;
    if (!rateLimit(rlKey, 30, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(rlKey));

    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

    const [orderSnap, settings] = await Promise.all([
      adminDb.collection('orders').doc(orderId).get(),
      getStoreSettings(),
    ]);

    if (!orderSnap.exists) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    const order = orderSnap.data() as Order;

    if (order.status !== 'paid' && order.status !== 'preparing') {
      return NextResponse.json({ error: 'Order not ready for dispatch' }, { status: 409 });
    }

    const coords = await geocodeCEP(order.address.cep);
    const distKm = coords
      ? haversine(settings.originLat, settings.originLng, coords.lat, coords.lng)
      : 9999;

    let carrier: string;
    let trackingCode: string;
    let deliveryData: Record<string, unknown> = {};

    if (distKm <= settings.localDeliveryRadiusKm) {
      try {
        const buyerName = await getBuyerName(order.userId);
        const uber = await dispatchUberDirect(orderId, order.address, buyerName, order.items, settings);
        carrier = 'uber_direct';
        trackingCode = uber.id;
        deliveryData = { uberDeliveryId: uber.id, trackingUrl: uber.trackingUrl ?? null };
      } catch (uberErr) {
        console.warn('Uber Direct indisponível, fallback manual:', uberErr);
        carrier = 'manual';
        trackingCode = `MAN-${orderId.slice(-8).toUpperCase()}`;
        deliveryData = { fallback: true };
      }
    } else {
      const meCart = await addToMelhorEnvioCart(orderId, order.address.cep, order.items, settings);
      carrier = 'melhor_envio';
      trackingCode = meCart[0]?.id ?? '';
      deliveryData = { melhorEnvioCartId: meCart[0]?.id };
    }

    await adminDb.collection('orders').doc(orderId).update({
      status: 'shipped',
      'delivery.carrier': carrier,
      'delivery.trackingCode': trackingCode,
      'delivery.dispatchedAt': FieldValue.serverTimestamp(),
      'delivery.distanceKm': Math.round(distKm),
      'delivery.data': deliveryData,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ carrier, trackingCode, distKm: Math.round(distKm) });
  } catch (err) {
    console.error('delivery dispatch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
