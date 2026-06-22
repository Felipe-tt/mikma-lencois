export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { tooManyRequests } from '@/lib/security';
import { getSettings } from '@/lib/settings';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ShippingOption {
  carrier: string;            // 'uber_direct' | 'disk_tenha' | 'melhor_envio_pac' | 'melhor_envio_sedex' | 'correios_pac' | 'correios_sedex'
  label: string;              // Nome exibido ao usuário
  priceCents: number;
  estimatedDays: number;      // 0 = hoje / entrega imediata
  available: boolean;
  tag?: 'local' | 'economico' | 'rapido'; // badge de destaque
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeCep(cep: string): Promise<{ lat: number; lng: number } | null> {
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) return null;

  // ── Check Firestore cache first ──────────────────────────────────────────
  // CEPs map to fixed locations — once geocoded, a CEP never needs to be
  // looked up again. This is what makes the feature reliable: without it,
  // every single shipping quote (for every customer, including the store's
  // own origin CEP on every request) hit Nominatim's free public instance,
  // which aggressively rate-limits non-cached, repeated traffic.
  try {
    const cacheRef = adminDb.collection('geocache').doc(clean);
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) {
      const d = cacheSnap.data()!;
      if (typeof d.lat === 'number' && typeof d.lng === 'number') {
        return { lat: d.lat, lng: d.lng };
      }
    }
  } catch {
    // cache read failure shouldn't block geocoding — fall through
  }

  try {
    const v = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const d = await v.json();
    if (d.erro) return null;

    const q = encodeURIComponent(`${d.logradouro ?? ''}, ${d.localidade}, ${d.uf}, Brasil`);
    const g = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      {
        // Nominatim's usage policy requires a descriptive User-Agent that
        // identifies the application and provides a contact reference —
        // a generic User-Agent gets silently rate-limited/blocked under load.
        headers: { 'User-Agent': 'MikmaLencoisShipping/1.0 (+https://mikma-lencois.web.app)' },
      }
    );
    const [hit] = await g.json();
    if (!hit) return null;

    const coords = { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };

    // Cache for next time — fire-and-forget, never blocks the response
    adminDb.collection('geocache').doc(clean).set({
      lat: coords.lat,
      lng: coords.lng,
      cep: clean,
      cachedAt: new Date().toISOString(),
    }).catch(() => {});

    return coords;
  } catch {
    return null;
  }
}

// ── Carrier: Uber Direct (local, instântâneo) ────────────────────────────────
// Sem API de cotação pública — estimamos preço baseado em km + taxa fixa
// Os valores abaixo são aproximados para Blumenau/SC (ajuste conforme contrato)
function estimateUberDirect(distKm: number): ShippingOption {
  // Taxa base + por km (tarifa simplificada Uber Flash)
  const base = 800;      // R$ 8,00
  const perKm = 150;     // R$ 1,50/km
  const priceCents = Math.round(base + perKm * Math.max(0, distKm - 2));
  return {
    carrier: 'uber_direct',
    label: 'Entrega hoje — Uber Direct',
    priceCents,
    estimatedDays: 0,
    available: true,
    tag: 'local',
  };
}

// ── Carrier: Disk Tenha (entrega local própria) ──────────────────────────────
// Taxa fixa por raio — configure conforme sua tabela
function estimateDiskTenha(distKm: number): ShippingOption {
  let priceCents: number;
  if (distKm <= 5)        priceCents = 700;
  else if (distKm <= 10)  priceCents = 1000;
  else if (distKm <= 20)  priceCents = 1500;
  else                    priceCents = 2000;

  return {
    carrier: 'disk_tenha',
    label: 'Entrega hoje — Disk Tenha',
    priceCents,
    estimatedDays: 0,
    available: true,
    tag: 'local',
  };
}

// ── Carrier: Melhor Envio ────────────────────────────────────────────────────
interface MelhorEnvioShipment {
  id: number | string;
  name: string;
  price: string;
  custom_price: string;
  discount: string;
  currency: string;
  delivery_time: number;
  delivery_range: { min: number; max: number };
  custom_delivery_time: number;
  custom_delivery_range: { min: number; max: number };
  error?: string;
}

async function quoteMelhorEnvio(
  fromCep: string,
  toCep: string,
  totalWeightKg: number,
  productValueCents: number,
  token: string
): Promise<ShippingOption[]> {
  const body = {
    from: { postal_code: fromCep.replace(/\D/g, '') },
    to:   { postal_code: toCep.replace(/\D/g, '') },
    package: {
      height: 20,
      width: 40,
      length: 50,
      weight: Math.max(0.3, totalWeightKg),
    },
    options: {
      receipt: false,
      own_hand: false,
      insurance_value: productValueCents / 100,
    },
    services: '1,2', // 1=PAC, 2=SEDEX (Correios via ME)
  };

  const res = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'MikmaLencois/1.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.warn('Melhor Envio quote failed:', res.status);
    return [];
  }

  const data: MelhorEnvioShipment[] = await res.json();
  const results: ShippingOption[] = [];

  for (const s of data) {
    if (s.error) continue;
    const price = parseFloat(s.custom_price ?? s.price ?? '0');
    if (!price) continue;

    const isCorreiosPac   = String(s.id) === '1';
    const isCorreiosSedex = String(s.id) === '2';

    results.push({
      carrier: isCorreiosPac ? 'correios_pac' : isCorreiosSedex ? 'correios_sedex' : `melhor_envio_${s.id}`,
      label:   isCorreiosPac ? 'Correios PAC' : isCorreiosSedex ? 'Correios SEDEX' : s.name,
      priceCents: Math.round(price * 100),
      estimatedDays: s.custom_delivery_time ?? s.delivery_time ?? 7,
      available: true,
      tag: isCorreiosPac ? 'economico' : isCorreiosSedex ? 'rapido' : undefined,
    });
  }

  return results;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(`shipping:ip:${ip}`, 30, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`shipping:ip:${ip}`));
  }

  try {
    // Auth — any logged-in user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    const uid = decoded.uid;

    if (!rateLimit(`shipping:uid:${uid}`, 20, 60 * 60 * 1000)) {
      return tooManyRequests(rateLimitRetryAfter(`shipping:uid:${uid}`));
    }

    const { destCep } = await req.json();
    if (!destCep || typeof destCep !== 'string' || destCep.replace(/\D/g, '').length !== 8) {
      return NextResponse.json({ error: 'CEP inválido' }, { status: 400 });
    }

    const [settings, cartSnap] = await Promise.all([
      getSettings(),
      adminDb.collection('carts').doc(uid).get(),
    ]);

    if (!cartSnap.exists || !cartSnap.data()?.items?.length) {
      return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });
    }

    // Load trusted prices from Firestore
    const cartItems: Array<{ productId: string; quantity: number }> = cartSnap.data()!.items;
    const productIds = Array.from(new Set(cartItems.map(i => i.productId)));
    const productDocs = await Promise.all(productIds.map(id => adminDb.collection('products').doc(id).get()));
    const priceMap: Record<string, number> = {};
    for (const snap of productDocs) {
      if (snap.exists) priceMap[snap.id] = snap.data()!.price as number;
    }
    const productValueCents = cartItems.reduce((s, i) => s + (priceMap[i.productId] ?? 0) * i.quantity, 0);
    const totalWeightKg = cartItems.reduce(
      (s, i) => s + (settings.defaultItemWeightKg || 0.8) * i.quantity, 0
    );

    // Free shipping threshold
    const freeThreshold = settings.freeShippingThresholdCents ?? 0;
    const qualifiesFreeShipping = freeThreshold > 0 && productValueCents >= freeThreshold;

    // Geocode both ends
    const [originCoords, destCoords] = await Promise.all([
      settings.originLat && settings.originLng
        ? Promise.resolve({ lat: settings.originLat, lng: settings.originLng })
        : geocodeCep(settings.originCep),
      geocodeCep(destCep),
    ]);

    const distKm = originCoords && destCoords
      ? haversineKm(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng)
      : 9999;

    const isLocal = distKm <= (settings.localDeliveryRadiusKm || 10);
    const options: ShippingOption[] = [];

    // ── Local carriers (only if within radius) ────────────────────────────
    if (isLocal) {
      options.push(estimateUberDirect(distKm));
      options.push(estimateDiskTenha(distKm));
    }

    // ── Melhor Envio / Correios ────────────────────────────────────────────
    const meToken = process.env.MELHOR_ENVIO_TOKEN;
    if (meToken && settings.originCep) {
      const meOptions = await quoteMelhorEnvio(
        settings.originCep, destCep, totalWeightKg, productValueCents, meToken
      );
      options.push(...meOptions);
    }

    // ── Apply free shipping ───────────────────────────────────────────────
    if (qualifiesFreeShipping) {
      for (const o of options) {
        o.priceCents = 0;
      }
    }

    // ── Sort: cheapest first, then fastest ────────────────────────────────
    options.sort((a, b) => {
      if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents;
      return a.estimatedDays - b.estimatedDays;
    });

    // ── Fallback: if no options at all, offer a generic PAC estimate ──────
    if (options.length === 0) {
      options.push({
        carrier: 'correios_pac',
        label: 'Correios PAC',
        priceCents: qualifiesFreeShipping ? 0 : 2500,
        estimatedDays: 10,
        available: true,
        tag: 'economico',
      });
      options.push({
        carrier: 'correios_sedex',
        label: 'Correios SEDEX',
        priceCents: qualifiesFreeShipping ? 0 : 4500,
        estimatedDays: 3,
        available: true,
        tag: 'rapido',
      });
    }

    return NextResponse.json({
      options,
      distKm: Math.round(distKm),
      isLocal,
      freeShipping: qualifiesFreeShipping,
      _debug: {
        originCep: settings.originCep || '(vazio)',
        originLat: settings.originLat,
        originLng: settings.originLng,
        cartItemsCount: cartItems.length,
        totalWeightKg: Math.round(totalWeightKg * 100) / 100,
        productValueCents,
        hasMelhorEnvioToken: !!process.env.MELHOR_ENVIO_TOKEN,
        distKm: Math.round(distKm),
        isLocal,
        optionsCount: options.length,
      },
    });
  } catch (err) {
    console.error('shipping/quote error:', err);
    return NextResponse.json({ error: 'Erro ao calcular frete' }, { status: 500 });
  }
}
