export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { tooManyRequests } from '@/lib/security';
import { getSettings } from '@/lib/settings';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShippingOption {
  carrier: string;
  label: string;
  priceCents: number;
  estimatedDays: number;
  available: boolean;
  tag?: 'local' | 'economico' | 'rapido';
  error?: string;
}

interface PackageDimensions {
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}

// ── Geocode + cache ───────────────────────────────────────────────────────────

async function geocodeCep(cep: string): Promise<{ lat: number; lng: number } | null> {
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) return null;

  try {
    const cacheSnap = await adminDb.collection('geocache').doc(clean).get();
    if (cacheSnap.exists) {
      const d = cacheSnap.data()!;
      if (typeof d.lat === 'number' && typeof d.lng === 'number') return { lat: d.lat, lng: d.lng };
    }
  } catch { /* cache miss */ }

  try {
    const v = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const d = await v.json();
    if (d.erro) return null;
    const q = encodeURIComponent(`${d.logradouro ?? ''}, ${d.localidade}, ${d.uf}, Brasil`);
    const g = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'User-Agent': 'MikmaLencoisShipping/1.0 (+https://mikma.com.br)' } }
    );
    const [hit] = await g.json();
    if (!hit) return null;
    const coords = { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
    adminDb.collection('geocache').doc(clean).set({ ...coords, cep: clean, cachedAt: new Date().toISOString() }).catch(() => {});
    return coords;
  } catch { return null; }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Uber Direct OAuth2 ────────────────────────────────────────────────────────
// Uber Direct usa Client Credentials OAuth2 — token em cache no Firestore

async function getUberToken(): Promise<string | null> {
  const clientId     = process.env.UBER_DIRECT_CLIENT_ID;
  const clientSecret = process.env.UBER_DIRECT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Cache token para evitar chamada a cada cotação
  try {
    const cacheSnap = await adminDb.collection('_cache').doc('uber_token').get();
    if (cacheSnap.exists) {
      const d = cacheSnap.data()!;
      if (d.token && d.expiresAt && Date.now() < d.expiresAt - 60_000) return d.token as string;
    }
  } catch { /* miss */ }

  const res = await fetch('https://login.uber.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'eats.deliveries',
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const token = data.access_token as string;
  const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  adminDb.collection('_cache').doc('uber_token').set({ token, expiresAt }).catch(() => {});
  return token;
}

async function quoteUberDirect(
  distKm: number,
  fromAddress: string,
  toAddress: string,
  token: string
): Promise<ShippingOption> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID;
  if (!customerId) {
    // Estimativa local sem API
    const priceCents = Math.round(800 + 150 * Math.max(0, distKm - 2));
    return { carrier: 'uber_direct', label: 'Entrega hoje · Uber Direct', priceCents, estimatedDays: 0, available: true, tag: 'local' };
  }

  try {
    const res = await fetch(`https://api.uber.com/v1/customers/${customerId}/delivery_quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        pickup_address: fromAddress,
        dropoff_address: toAddress,
      }),
    });
    if (!res.ok) throw new Error(`Uber quote ${res.status}`);
    const data = await res.json();
    const fee = data.fee ?? data.total_fee ?? 0; // centavos já
    return {
      carrier: 'uber_direct',
      label: 'Entrega hoje · Uber Direct',
      priceCents: typeof fee === 'number' ? fee : Math.round(parseFloat(fee) * 100),
      estimatedDays: 0,
      available: true,
      tag: 'local',
    };
  } catch {
    // Fallback por distância
    const priceCents = Math.round(800 + 150 * Math.max(0, distKm - 2));
    return { carrier: 'uber_direct', label: 'Entrega hoje · Uber Direct', priceCents, estimatedDays: 0, available: true, tag: 'local' };
  }
}

// ── Disk Tenha ────────────────────────────────────────────────────────────────
// Disk Tenha não tem API pública — tabela de preço fixo por raio de distância.
// Valores podem ser ajustados nas variáveis de ambiente.

function quoteDiskTenha(distKm: number): ShippingOption {
  // Tabela padrão — substitua pelos valores reais do contrato Disk Tenha
  const priceByRadius = [
    { maxKm: 3,  priceCents: parseInt(process.env.DISK_TENHA_PRICE_3KM  ?? '600')  },
    { maxKm: 7,  priceCents: parseInt(process.env.DISK_TENHA_PRICE_7KM  ?? '900')  },
    { maxKm: 12, priceCents: parseInt(process.env.DISK_TENHA_PRICE_12KM ?? '1300') },
    { maxKm: 20, priceCents: parseInt(process.env.DISK_TENHA_PRICE_20KM ?? '1800') },
  ];
  const found = priceByRadius.find(r => distKm <= r.maxKm);
  const priceCents = found?.priceCents ?? 2500;

  return {
    carrier: 'disk_tenha',
    label: 'Entrega hoje · Disk Tenha',
    priceCents,
    estimatedDays: 0,
    available: true,
    tag: 'local',
  };
}

// ── Melhor Envio (PAC + SEDEX Correios) ──────────────────────────────────────

interface MEShipment {
  id: number | string;
  name: string;
  price: string;
  custom_price: string;
  delivery_time: number;
  custom_delivery_time: number;
  error?: string;
}

async function quoteMelhorEnvio(
  fromCep: string,
  toCep: string,
  pkg: PackageDimensions,
  productValueCents: number,
  token: string,
  sandbox: boolean
): Promise<ShippingOption[]> {
  const base = sandbox
    ? 'https://sandbox.melhorenvio.com.br'
    : 'https://melhorenvio.com.br';

  const body = {
    from: { postal_code: fromCep.replace(/\D/g, '') },
    to:   { postal_code: toCep.replace(/\D/g, '') },
    package: {
      height: pkg.heightCm,
      width:  pkg.widthCm,
      length: pkg.lengthCm,
      weight: Math.max(0.3, pkg.weightKg),
    },
    options: {
      receipt: false,
      own_hand: false,
      insurance_value: productValueCents / 100,
    },
    services: '1,2', // 1=PAC, 2=SEDEX
  };

  const res = await fetch(`${base}/api/v2/me/shipment/calculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'MikmaLencois/1.0 (contato@mikma.com.br)',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.warn('[MelhorEnvio] quote failed:', res.status, await res.text().catch(() => ''));
    return [];
  }

  const data: MEShipment[] = await res.json();
  return data
    .filter(s => !s.error && parseFloat(s.custom_price ?? s.price ?? '0') > 0)
    .map(s => {
      const price = parseFloat(s.custom_price ?? s.price);
      const days  = s.custom_delivery_time ?? s.delivery_time ?? 7;
      const isPac   = String(s.id) === '1';
      const isSedex = String(s.id) === '2';
      return {
        carrier:      isPac ? 'correios_pac' : isSedex ? 'correios_sedex' : `melhor_envio_${s.id}`,
        label:        isPac ? 'Correios PAC' : isSedex ? 'Correios SEDEX' : s.name,
        priceCents:   Math.round(price * 100),
        estimatedDays: days,
        available:    true,
        tag:          isPac ? 'economico' : isSedex ? 'rapido' : undefined,
      } satisfies ShippingOption;
    });
}

// ── Correios API REST v2 (fallback sem Melhor Envio) ─────────────────────────
// Autenticação: Basic Auth com cartão postagem + código de acesso
// Documentação: https://cws.correios.com.br/apidoc

async function quoteCorreiosDireto(
  fromCep: string,
  toCep: string,
  pkg: PackageDimensions,
  productValueCents: number
): Promise<ShippingOption[]> {
  const cartao = process.env.CORREIOS_CARTAO_POSTAGEM;
  const codigo = process.env.CORREIOS_CODIGO_ACESSO;
  if (!cartao || !codigo) return [];

  // Autenticar e obter token JWT dos Correios
  let token: string;
  try {
    const authRes = await fetch('https://cws.correios.com.br/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${cartao}:${codigo}`).toString('base64')}`,
      },
      body: JSON.stringify({ numero: cartao }),
    });
    if (!authRes.ok) return [];
    const authData = await authRes.json();
    token = authData.token ?? authData.data?.token;
    if (!token) return [];
  } catch { return []; }

  const servicos = [
    { codigo: '03298', label: 'Correios PAC',   tag: 'economico' as const },
    { codigo: '03220', label: 'Correios SEDEX',  tag: 'rapido'   as const },
  ];

  const results: ShippingOption[] = [];
  for (const svc of servicos) {
    try {
      const res = await fetch('https://cws.correios.com.br/calculo/preco/nacional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          idLote: '1',
          parametrosProduto: [{
            coProduto: svc.codigo,
            cepOrigem: fromCep.replace(/\D/g, ''),
            cepDestino: toCep.replace(/\D/g, ''),
            peso: Math.max(300, Math.round(pkg.weightKg * 1000)), // gramas
            comprimento: pkg.lengthCm,
            largura: pkg.widthCm,
            altura: pkg.heightCm,
            servicosAdicionais: productValueCents >= 50000 ? ['019'] : [], // AR para pedidos > R$500
            vlDeclarado: (productValueCents / 100).toFixed(2),
          }],
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const item = data?.parametrosProduto?.[0];
      if (!item || item.txErro) continue;
      const price = parseFloat(item.pcFinal ?? '0');
      const days  = parseInt(item.prazoEntrega ?? '10', 10);
      if (price <= 0) continue;
      results.push({
        carrier: svc.codigo === '03298' ? 'correios_pac' : 'correios_sedex',
        label: svc.label,
        priceCents: Math.round(price * 100),
        estimatedDays: days,
        available: true,
        tag: svc.tag,
      });
    } catch { /* serviço indisponível, tenta o próximo */ }
  }
  return results;
}

// ── Total Express ─────────────────────────────────────────────────────────────
// API REST Total Express — documentação: https://api.totalexpress.com.br
// Necessita: TOTAL_EXPRESS_TOKEN + TOTAL_EXPRESS_CLIENT_CODE

async function quoteTotalExpress(
  fromCep: string,
  toCep: string,
  pkg: PackageDimensions,
  productValueCents: number
): Promise<ShippingOption[]> {
  const token      = process.env.TOTAL_EXPRESS_TOKEN;
  const clientCode = process.env.TOTAL_EXPRESS_CLIENT_CODE;
  if (!token || !clientCode) return [];

  try {
    const res = await fetch('https://api.totalexpress.com.br/api/v2/cota', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        remetente: { cep: fromCep.replace(/\D/g, '') },
        destinatario: { cep: toCep.replace(/\D/g, '') },
        volumes: [{
          peso: Math.max(0.3, pkg.weightKg),
          altura: pkg.heightCm,
          largura: pkg.widthCm,
          comprimento: pkg.lengthCm,
          valor: productValueCents / 100,
        }],
        codigoCliente: clientCode,
      }),
    });

    if (!res.ok) {
      console.warn('[TotalExpress] quote failed:', res.status);
      return [];
    }

    const data = await res.json();
    const servicos: Array<{ nome: string; preco: number; prazo: number }> = data?.servicos ?? [];

    return servicos
      .filter(s => s.preco > 0)
      .map(s => ({
        carrier:      'total_express',
        label:        `Total Express · ${s.nome}`,
        priceCents:   Math.round(s.preco * 100),
        estimatedDays: s.prazo,
        available:    true,
        tag:          s.prazo <= 2 ? 'rapido' : 'economico',
      }));
  } catch (e) {
    console.warn('[TotalExpress] error:', e);
    return [];
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(`shipping:ip:${ip}`, 30, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`shipping:ip:${ip}`));
  }

  try {
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
    if (!destCep || destCep.replace(/\D/g, '').length !== 8) {
      return NextResponse.json({ error: 'CEP inválido' }, { status: 400 });
    }

    const [settings, cartSnap] = await Promise.all([
      getSettings(),
      adminDb.collection('carts').doc(uid).get(),
    ]);

    if (!cartSnap.exists || !cartSnap.data()?.items?.length) {
      return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });
    }

    const cartItems: Array<{ productId: string; quantity: number }> = cartSnap.data()!.items;
    const productIds = Array.from(new Set(cartItems.map(i => i.productId)));
    const productDocs = await Promise.all(productIds.map(id => adminDb.collection('products').doc(id).get()));
    const priceMap: Record<string, number> = {};
    for (const snap of productDocs) {
      if (snap.exists) priceMap[snap.id] = snap.data()!.price as number;
    }

    const productValueCents = cartItems.reduce((s, i) => s + (priceMap[i.productId] ?? 0) * i.quantity, 0);
    const totalWeightKg = cartItems.reduce((s, i) => s + (settings.defaultItemWeightKg || 0.8) * i.quantity, 0);
    const pkg: PackageDimensions = { weightKg: totalWeightKg, heightCm: 20, widthCm: 40, lengthCm: 50 };

    const freeThreshold = settings.freeShippingThresholdCents ?? 0;
    const freeShipping  = freeThreshold > 0 && productValueCents >= freeThreshold;

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
    const fromCep = settings.originCep || '';

    // Monta endereços para Uber
    const fromAddress = [settings.storeAddress, settings.storeCity, settings.storeState, fromCep].filter(Boolean).join(', ');
    const toAddress   = `CEP ${destCep}`;

    // Roda tudo em paralelo
    const [uberToken, meOptions, correiosOptions, teOptions] = await Promise.all([
      isLocal ? getUberToken() : Promise.resolve(null),
      process.env.MELHOR_ENVIO_TOKEN && fromCep
        ? quoteMelhorEnvio(fromCep, destCep, pkg, productValueCents, process.env.MELHOR_ENVIO_TOKEN, process.env.MELHOR_ENVIO_SANDBOX === 'true')
        : Promise.resolve([] as ShippingOption[]),
      // Correios direto só se não tem Melhor Envio
      !process.env.MELHOR_ENVIO_TOKEN && fromCep
        ? quoteCorreiosDireto(fromCep, destCep, pkg, productValueCents)
        : Promise.resolve([] as ShippingOption[]),
      fromCep
        ? quoteTotalExpress(fromCep, destCep, pkg, productValueCents)
        : Promise.resolve([] as ShippingOption[]),
    ]);

    const options: ShippingOption[] = [];

    // Carriers locais (só dentro do raio)
    if (isLocal) {
      if (uberToken) {
        options.push(await quoteUberDirect(distKm, fromAddress, toAddress, uberToken));
      } else if (process.env.UBER_DIRECT_CLIENT_ID) {
        // Token falhou — estimativa
        options.push(quoteDiskTenha(distKm)); // usa Disk Tenha como fallback local
      }
      options.push(quoteDiskTenha(distKm));
    }

    options.push(...meOptions, ...correiosOptions, ...teOptions);

    // Remove duplicatas (mesmo carrier) — mantém o mais barato
    const seen = new Map<string, ShippingOption>();
    for (const o of options) {
      const existing = seen.get(o.carrier);
      if (!existing || o.priceCents < existing.priceCents) seen.set(o.carrier, o);
    }
    const deduped = Array.from(seen.values());

    // Frete grátis
    if (freeShipping) for (const o of deduped) o.priceCents = 0;

    // Ordena: mais barato, depois mais rápido
    deduped.sort((a, b) => a.priceCents !== b.priceCents ? a.priceCents - b.priceCents : a.estimatedDays - b.estimatedDays);

    // Fallback se nada retornou
    if (deduped.length === 0) {
      deduped.push(
        { carrier: 'correios_pac',   label: 'Correios PAC',   priceCents: freeShipping ? 0 : 2500, estimatedDays: 10, available: true, tag: 'economico' },
        { carrier: 'correios_sedex', label: 'Correios SEDEX', priceCents: freeShipping ? 0 : 4500, estimatedDays: 3,  available: true, tag: 'rapido'    }
      );
    }

    return NextResponse.json({
      options: deduped,
      distKm: Math.round(distKm),
      isLocal,
      freeShipping,
      _debug: {
        originCep: fromCep || '(não configurado)',
        hasMelhorEnvio: !!process.env.MELHOR_ENVIO_TOKEN,
        hasCorreiosDireto: !!(process.env.CORREIOS_CARTAO_POSTAGEM && process.env.CORREIOS_CODIGO_ACESSO),
        hasTotalExpress: !!(process.env.TOTAL_EXPRESS_TOKEN && process.env.TOTAL_EXPRESS_CLIENT_CODE),
        hasUberDirect: !!(process.env.UBER_DIRECT_CLIENT_ID && process.env.UBER_DIRECT_CLIENT_SECRET),
        optionsCount: deduped.length,
        distKm: Math.round(distKm),
        isLocal,
        totalWeightKg: Math.round(totalWeightKg * 100) / 100,
      },
    });
  } catch (err) {
    console.error('shipping/quote error:', err);
    return NextResponse.json({ error: 'Erro ao calcular frete' }, { status: 500 });
  }
}
