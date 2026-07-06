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
  /** Uber Direct: quoteId retornado pela API para garantir o preço cotado no despacho */
  quoteId?: string;
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

// ── Uber Direct ───────────────────────────────────────────────────────────────
import { getUberToken, uberQuote, buildUberAddress, uberDirectConfigured } from '@/lib/uber-direct';

/**
 * Monta string de endereço para a API do Uber Direct a partir dos dados do ViaCEP.
 * O número da casa não está disponível na etapa de cotação (só temos o CEP),
 * então usamos o logradouro sem número — suficiente para estimativa de preço.
 * Na criação real da entrega (delivery/route.ts) usamos o endereço completo do pedido.
 */
async function buildDropoffAddress(cep: string): Promise<string> {
  // Retorna JSON string conforme exigido pela API Uber Direct
  const clean = cep.replace(/\D/g, '');
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, {
      signal: AbortSignal.timeout(3000),
    });
    const d = await res.json();
    if (d.erro) {
      return JSON.stringify({ street_address: [clean], city: '', state: '', zip_code: clean, country: 'BR' });
    }
    return buildUberAddress({
      street:  d.logradouro ?? '',
      city:    d.localidade ?? '',
      state:   d.uf ?? '',
      zipCode: clean,
    });
  } catch {
    return JSON.stringify({ street_address: [''], city: '', state: '', zip_code: clean, country: 'BR' });
  }
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
    services: '1,2,7,18', // 1=PAC, 2=SEDEX, 7=Jadlog Package, 18=Jadlog Expresso
  };

  try {
    const res = await fetch(`${base}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'MikmaLencois/1.0 (contato@mikma.com.br)',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn('[MelhorEnvio] quote failed:', res.status, await res.text().catch(() => ''));
      return [];
    }

    const data: MEShipment[] = await res.json();

    // Loga cada serviço que veio com erro — sem isso, um serviço não
    // contratado/habilitado na conta (ex: Jadlog) simplesmente
    // desaparece da lista sem nenhuma pista do motivo.
    for (const s of data) {
      if (s.error) {
        console.warn(`[MelhorEnvio] serviço ${s.id} (${s.name ?? '?'}) indisponível: ${s.error}`);
      }
    }

    return data
      .filter(s => !s.error && parseFloat(s.custom_price ?? s.price ?? '0') > 0)
      .map(s => {
        const price    = parseFloat(s.custom_price ?? s.price);
        const days     = s.custom_delivery_time ?? s.delivery_time ?? 7;
        const id       = String(s.id);
        const isPac    = id === '1';
        const isSedex  = id === '2';
        const isJadPkg = id === '7';
        const isJadExp = id === '18';
        return {
          carrier:       isPac ? 'correios_pac' : isSedex ? 'correios_sedex' : isJadPkg ? 'jadlog_package' : isJadExp ? 'jadlog_expresso' : `melhor_envio_${id}`,
          label:         isPac ? 'Correios PAC' : isSedex ? 'Correios SEDEX' : isJadPkg ? 'Jadlog Package' : isJadExp ? 'Jadlog Expresso' : s.name,
          priceCents:    Math.round(price * 100),
          estimatedDays: days,
          available:     true,
          tag:           isPac || isJadPkg ? 'economico' : isSedex || isJadExp ? 'rapido' : undefined,
        } satisfies ShippingOption;
      });
  } catch (e) {
    // Rede instável, timeout, DNS etc. — sem isso, um problema pontual na
    // API do Melhor Envio derrubava a cotação de frete INTEIRA (pickup,
    // Correios, Uber, tudo) em vez de só omitir essa transportadora.
    console.warn('[MelhorEnvio] erro de rede/timeout, transportadora omitida:', e instanceof Error ? e.message : e);
    return [];
  }
}


// ── Jadlog ────────────────────────────────────────────────────────────────────
// API Jadlog: https://www.jadlog.com.br/jadlog/api
// Necessita: JADLOG_TOKEN + JADLOG_ACCOUNT (número da conta)

async function quoteJadlog(
  fromCep: string,
  toCep: string,
  pkg: PackageDimensions,
  productValueCents: number
): Promise<ShippingOption[]> {
  const token   = process.env.JADLOG_TOKEN;
  const account = process.env.JADLOG_ACCOUNT;
  if (!token || !account) {
    // Fallback estimativa sem credencial
    return [
      {
        carrier: 'jadlog_package',
        label: 'Jadlog Package',
        priceCents: 3200,
        estimatedDays: 5,
        available: true,
        tag: 'economico' as const,
      },
    ];
  }

  const services = [
    { modalidade: 3, label: 'Jadlog Package', tag: 'economico' as const },
    { modalidade: 0, label: 'Jadlog Expresso', tag: 'rapido' as const },
  ];

  const results: ShippingOption[] = [];
  for (const svc of services) {
    try {
      const res = await fetch('https://www.jadlog.com.br/embarcador/api/frete/valor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          frete: {
            modalidade: svc.modalidade,
            tipoFrete: 'C',
            cepOrigem: fromCep.replace(/\D/g, ''),
            cepDestino: toCep.replace(/\D/g, ''),
            valor: (productValueCents / 100).toFixed(2),
            peso: Math.max(0.3, pkg.weightKg),
            conta: account,
            contaCorrente: account,
            vlColeta: 0,
          },
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const valor = parseFloat(data?.frete?.vlfrete ?? '0');
      const prazo = parseInt(data?.frete?.prazo ?? '7', 10);
      if (valor <= 0) continue;
      results.push({
        carrier: svc.modalidade === 3 ? 'jadlog_package' : 'jadlog_expresso',
        label: svc.label,
        priceCents: Math.round(valor * 100),
        estimatedDays: prazo,
        available: true,
        tag: svc.tag,
      });
    } catch { /* serviço indisponível */ }
  }

  // Fallback se API não respondeu
  if (results.length === 0) {
    results.push({
      carrier: 'jadlog_package',
      label: 'Jadlog Package',
      priceCents: 3200,
      estimatedDays: 5,
      available: true,
      tag: 'economico',
    });
  }

  return results;
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
    const weightMap: Record<string, number> = {};
    for (const snap of productDocs) {
      if (snap.exists) {
        priceMap[snap.id] = snap.data()!.price as number;
        weightMap[snap.id] = (snap.data()!.weightKg as number | undefined) ?? (settings.defaultItemWeightKg || 0.8);
      }
    }

    const productValueCents = cartItems.reduce((s, i) => s + (priceMap[i.productId] ?? 0) * i.quantity, 0);
    const totalWeightKg = cartItems.reduce((s, i) => s + (weightMap[i.productId] ?? settings.defaultItemWeightKg ?? 0.8) * i.quantity, 0);
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

    // O painel (settings.localDeliveryRadiusKm) é a fonte de verdade — a env var
    // UBER_DIRECT_RADIUS_KM só serve de fallback caso o documento de settings não
    // tenha o campo definido (nunca deve sobrepor o valor salvo no painel).
    const radiusKm = settings.localDeliveryRadiusKm || parseInt(process.env.UBER_DIRECT_RADIUS_KM ?? '0') || 10;
    const isLocal  = distKm <= radiusKm;
    const fromCep  = settings.originCep || '';

    // ── Opções de frete ─────────────────────────────────────────────────────────────────
    const options: ShippingOption[] = [];

    // Retirada na loja (sempre disponível)
    options.push({
      carrier: 'pickup',
      label: 'Retirar na loja',
      priceCents: 0,
      estimatedDays: 0,
      available: true,
      tag: 'local',
    });

    // ── Uber Direct (entrega local no mesmo dia) ──────────────────────────────
    // Só aparece se: cliente está dentro do raio E as credenciais do ambiente
    // selecionado (settings.uberDirectSandboxMode, editável no painel) estão
    // configuradas. Sandbox nunca gera entrega real — só pra testar o fluxo.
    const uberSandbox = !!settings.uberDirectSandboxMode;
    let uberDebug: string | undefined;
    if (isLocal) {
      if (uberDirectConfigured(uberSandbox)) {
        try {
          const token = await getUberToken(uberSandbox);
          void token; // já validado — uberQuote usa internamente
          const pickupAddr = buildUberAddress({
            street:  settings.storeAddress ?? '',
            number:  settings.storeNumber  ?? '',
            city:    settings.storeCity    ?? '',
            state:   settings.storeState   ?? '',
            zipCode: fromCep,
          });
          const dropoffAddr = await buildDropoffAddress(destCep);
          const quote = await uberQuote(pickupAddr, dropoffAddr, uberSandbox);
          options.push({
            carrier:       'uber_direct',
            label:         uberSandbox ? 'Entrega hoje · Uber Direct (TESTE)' : 'Entrega hoje · Uber Direct',
            priceCents:    quote.feeCents,
            estimatedDays: 0,
            available:     true,
            tag:           'local',
            quoteId:       quote.quoteId,  // garante o preço cotado no despacho
          });
        } catch (e) {
          // Uber indisponível para essa rota — não exibe a opção
          uberDebug = e instanceof Error ? e.message : String(e);
          console.warn(`[uber-direct] quote falhou (${uberSandbox ? 'sandbox' : 'produção'}), opção omitida:`, uberDebug);
        }
      } else {
        uberDebug = uberSandbox
          ? 'UBER_DIRECT_SANDBOX_CLIENT_ID / SECRET / CUSTOMER_ID não configurados no ambiente'
          : 'UBER_DIRECT_CLIENT_ID / SECRET / CUSTOMER_ID não configurados no ambiente';
      }
    }

    const meToken = process.env.MELHOR_ENVIO_TOKEN;
    const sandbox = process.env.MELHOR_ENVIO_SANDBOX === 'true';

    if (fromCep && meToken) {
      // Melhor Envio cobre PAC, SEDEX e Jadlog numa só chamada
      const meOptions = await quoteMelhorEnvio(fromCep, destCep, pkg, productValueCents, meToken, sandbox);
      options.push(...meOptions);
    } else if (fromCep) {
      // Fallback: APIs diretas
      const [correiosOptions, jadlogOptions] = await Promise.all([
        quoteCorreiosDireto(fromCep, destCep, pkg, productValueCents),
        quoteJadlog(fromCep, destCep, pkg, productValueCents),
      ]);
      options.push(...correiosOptions, ...jadlogOptions);
    }

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

    // Fallback se correios/jadlog não retornaram (sem credenciais configuradas)
    // Mantém retirada na loja que sempre está
    const hasCarrier = deduped.some(o => o.carrier !== 'pickup');
    if (!hasCarrier) {
      deduped.push(
        { carrier: 'correios_pac',   label: 'Correios PAC',   priceCents: freeShipping ? 0 : 2500, estimatedDays: 10, available: true, tag: 'economico' },
        { carrier: 'correios_sedex', label: 'Correios SEDEX', priceCents: freeShipping ? 0 : 4500, estimatedDays: 3,  available: true, tag: 'rapido'    },
        { carrier: 'jadlog_package', label: 'Jadlog Package', priceCents: freeShipping ? 0 : 3200, estimatedDays: 5,  available: true, tag: 'economico' }
      );
    }

    return NextResponse.json({
      options: deduped,
      distKm: Math.round(distKm),
      isLocal,
      freeShipping,
      // Diagnóstico temporário: só exposto pra seller/admin, nunca pro
      // comprador final. Motivo exato de o Uber Direct ter sido omitido
      // da lista (undefined = não se aplicava ou funcionou normalmente).
      ...(uberDebug && (decoded.role === 'seller' || decoded.role === 'admin') ? { uberDebug, uberSandbox } : {}),
    });
  } catch (err) {
    console.error('shipping/quote error:', err);
    return NextResponse.json({ error: 'Erro ao calcular frete' }, { status: 500 });
  }
}
