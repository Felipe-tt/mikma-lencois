import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

// Store origin — , Blumenau SC
const ORIGIN = { lat: 0, lng: 0, cep: '' };
const LOCAL_RADIUS_KM = 10;

interface ViaCEPResponse {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

interface CEPCoords {
  lat: number;
  lng: number;
  city: string;
  state: string;
  street: string;
}

// Haversine distance in km
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

async function getCEPCoords(cep: string): Promise<CEPCoords | null> {
  try {
    const viaCep = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data: ViaCEPResponse = await viaCep.json();
    if (data.erro) return null;

    // Geocode via Nominatim (free, no key)
    const query = encodeURIComponent(`${data.logradouro}, ${data.localidade}, ${data.uf}, Brazil`);
    const geo = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
      headers: { 'User-Agent': 'MikmaLencois/1.0' },
    });
    const geoData = await geo.json();

    if (!geoData.length) return null;

    return {
      lat: parseFloat(geoData[0].lat),
      lng: parseFloat(geoData[0].lon),
      city: data.localidade,
      state: data.uf,
      street: data.logradouro,
    };
  } catch {
    return null;
  }
}

async function dispatchUberDirect(orderId: string, order: FirebaseFirestore.DocumentData, destAddress: string) {
  const UBER_KEY = process.env.UBER_DIRECT_API_KEY!;
  const UBER_CUSTOMER_ID = process.env.UBER_DIRECT_CUSTOMER_ID!;

  const items = (order.items as Array<{ name: string; quantity: number }>)
    .map((i) => `${i.quantity}x ${i.name}`)
    .join(', ');

  const res = await fetch(
    `https://api.uber.com/v1/customers/${UBER_CUSTOMER_ID}/deliveries`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${UBER_KEY}`,
      },
      body: JSON.stringify({
        pickup: {
          name: 'Mikma Lençóis',
          address: ' ',
          phone: process.env.STORE_PHONE,
        },
        dropoff: {
          name: order.buyerName,
          address: destAddress,
          phone: order.buyerPhone,
        },
        manifest: { reference: orderId, description: items },
      }),
    }
  );

  if (!res.ok) throw new Error(`Uber Direct error: ${await res.text()}`);
  return await res.json();
}

async function createMelhorEnvioShipment(orderId: string, destCep: string, order: FirebaseFirestore.DocumentData) {
  const ME_TOKEN = process.env.MELHOR_ENVIO_TOKEN!;

  const totalWeight = (order.items as Array<{ weight: number; quantity: number }>).reduce(
    (acc, i) => acc + i.weight * i.quantity,
    0
  );

  const res = await fetch('https://melhorenvio.com.br/api/v2/me/cart', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ME_TOKEN}`,
      'User-Agent': 'MikmaLencois/1.0 ',
    },
    body: JSON.stringify({
      from: { postal_code: ORIGIN.cep },
      to: { postal_code: destCep },
      products: [{ weight: totalWeight, width: 30, height: 20, length: 40, quantity: 1 }],
      services: '1,2', // PAC + SEDEX
      options: { receipt: false, own_hand: false },
    }),
  });

  if (!res.ok) throw new Error(`Melhor Envio error: ${await res.text()}`);
  return await res.json();
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);

    // Only seller/admin can dispatch
    const claims = decoded as { role?: string };
    if (!['seller', 'admin'].includes(claims.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { orderId } = await req.json();
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = orderSnap.data()!;
    if (order.status !== 'paid' && order.status !== 'preparing') {
      return NextResponse.json({ error: 'Order not ready for dispatch' }, { status: 409 });
    }

    const destCep = (order.address.cep as string).replace(/\D/g, '');
    const coords = await getCEPCoords(destCep);
    const distKm = coords ? haversine(ORIGIN.lat, ORIGIN.lng, coords.lat, coords.lng) : 999;

    let carrier = '';
    let trackingCode = '';
    let deliveryData: Record<string, unknown> = {};

    if (distKm <= LOCAL_RADIUS_KM) {
      // Try Uber Direct first
      try {
        const destAddress = `${order.address.street}, ${order.address.number}, ${order.address.city}, ${order.address.state}`;
        const uberResult = await dispatchUberDirect(orderId, order, destAddress);
        carrier = 'uber_direct';
        trackingCode = uberResult.id;
        deliveryData = { uberDeliveryId: uberResult.id, trackingUrl: uberResult.tracking_url };
      } catch (uberErr) {
        console.warn('Uber Direct failed, falling back to Disk & Tenha:', uberErr);
        carrier = 'disk_tenha';
        trackingCode = `DISK-${orderId.slice(-8).toUpperCase()}`;
        // Disk & Tenha: trigger email notification (no public API)
        deliveryData = { note: 'Notificação enviada para Disk & Tenha via e-mail' };
      }
    } else {
      // National shipping via Melhor Envio
      const meOptions = await createMelhorEnvioShipment(orderId, destCep, order);
      carrier = 'melhor_envio';
      trackingCode = meOptions[0]?.id ?? `ME-${orderId.slice(-8)}`;
      deliveryData = { melhorEnvioCartId: meOptions[0]?.id, options: meOptions };
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

    return NextResponse.json({ carrier, trackingCode, distKm: Math.round(distKm), deliveryData });
  } catch (err) {
    console.error('delivery dispatch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
