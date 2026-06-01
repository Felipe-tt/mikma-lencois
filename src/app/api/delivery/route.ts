import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Order, OrderItem, Address } from '@/types';

const ORIGIN = { lat: 0, lng: 0, cep: '' };
const LOCAL_RADIUS_KM = 10;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeCEP(cep: string): Promise<{ lat: number; lng: number } | null> {
  const clean = cep.replace(/\D/g, '');
  const viaCep = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
  const data = await viaCep.json();
  if (data.erro) return null;

  const query = encodeURIComponent(
    `${data.logradouro}, ${data.localidade}, ${data.uf}, Brasil`
  );
  const geo = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
    { headers: { 'User-Agent': 'MikmaLencois/1.0 ' } }
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
  orderId: string,
  address: Address,
  buyerName: string,
  items: OrderItem[]
): Promise<{ id: string; trackingUrl?: string }> {
  const manifest = items.map((i) => `${i.quantity}x ${i.productName}`).join(', ');
  const destAddress = `${address.street}, ${address.number}, ${address.city}, ${address.state}, ${address.cep}`;

  const res = await fetch(
    `https://api.uber.com/v1/customers/${process.env.UBER_DIRECT_CUSTOMER_ID}/deliveries`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.UBER_DIRECT_API_KEY}`,
      },
      body: JSON.stringify({
        pickup: {
          name: 'Mikma Lençóis',
          address: ', Garcia, Blumenau, SC, ',
          phone: process.env.STORE_PHONE,
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
  orderId: string,
  destCep: string,
  items: OrderItem[]
): Promise<{ id: string }[]> {
  const totalWeightKg = items.reduce((acc, i) => acc + 0.8 * i.quantity, 0); // default 800g per unit

  const res = await fetch('https://melhorenvio.com.br/api/v2/me/cart', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
      'User-Agent': 'MikmaLencois/1.0 ',
    },
    body: JSON.stringify({
      from: { postal_code: ORIGIN.cep },
      to: { postal_code: destCep.replace(/\D/g, '') },
      products: [
        { weight: totalWeightKg, width: 40, height: 20, length: 50, quantity: 1 },
      ],
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

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    const claims = decoded as { role?: string };

    if (!['seller', 'admin'].includes(claims.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const order = orderSnap.data() as Order;

    if (order.status !== 'paid' && order.status !== 'preparing') {
      return NextResponse.json({ error: 'Order not ready for dispatch' }, { status: 409 });
    }

    const coords = await geocodeCEP(order.address.cep);
    const distKm = coords
      ? haversine(ORIGIN.lat, ORIGIN.lng, coords.lat, coords.lng)
      : 9999;

    let carrier: string;
    let trackingCode: string;
    let deliveryData: Record<string, unknown> = {};

    if (distKm <= LOCAL_RADIUS_KM) {
      try {
        const buyerName = await getBuyerName(order.userId);
        const uber = await dispatchUberDirect(orderId, order.address, buyerName, order.items);
        carrier = 'uber_direct';
        trackingCode = uber.id;
        deliveryData = { uberDeliveryId: uber.id, trackingUrl: uber.trackingUrl ?? null };
      } catch (uberErr) {
        console.warn('Uber Direct indisponível, usando Disk & Tenha:', uberErr);
        carrier = 'disk_tenha';
        trackingCode = `DISK-${orderId.slice(-8).toUpperCase()}`;
        deliveryData = { fallback: true };
      }
    } else {
      const meCart = await addToMelhorEnvioCart(orderId, order.address.cep, order.items);
      carrier = 'melhor_envio';
      trackingCode = meCart[0]?.id ?? '';
      deliveryData = { melhorEnvioCartId: meCart[0]?.id };
    }

    await orderRef.update({
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
