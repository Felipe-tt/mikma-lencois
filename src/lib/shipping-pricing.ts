/**
 * src/lib/shipping-pricing.ts
 *
 * Cálculo de frete — ÚNICA fonte de verdade de preço, usada tanto por
 * /api/shipping/quote (pra exibir as opções) quanto pelos endpoints de
 * pagamento (create-pix, create-checkout). NUNCA confie num priceCents
 * vindo do navegador: sempre recalcule aqui e use o valor retornado.
 */
import { adminDb } from '@/lib/firebase/admin';
import { getUberToken, uberQuote, buildUberAddress, uberDirectConfigured } from '@/lib/uber-direct';
import type { StoreSettings } from '@/lib/store-settings';

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
  /**
   * Custo real do envio, SEMPRE preenchido no retorno de computeShippingOptions()
   * — mesmo quando priceCents é zerado por frete grátis. É o valor que a loja
   * de fato paga (ou vai pagar) pra transportadora. Opcional aqui porque é
   * preenchido de forma centralizada, não em cada função de cotação individual.
   * Nunca deve ser exposto ao cliente; usado internamente para registrar o
   * "caixa de frete" e travar despachos sem saldo. Ver src/lib/shipping-ledger.ts.
   */
  realPriceCents?: number;
}

export interface PackageDimensions {
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}

export interface ShippingQuoteResult {
  options: ShippingOption[];
  distKm: number;
  isLocal: boolean;
  freeShipping: boolean;
  uberDebug?: string;
  uberSandbox: boolean;
}

// ── Geocode + cache ───────────────────────────────────────────────────────────

export async function geocodeCep(cep: string): Promise<{ lat: number; lng: number } | null> {
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

/**
 * Monta string de endereço para a API do Uber Direct a partir dos dados do ViaCEP.
 * O número da casa não está disponível na etapa de cotação (só temos o CEP),
 * então usamos o logradouro sem número — suficiente para estimativa de preço.
 * Na criação real da entrega (delivery/route.ts) usamos o endereço completo do pedido.
 */
async function buildDropoffAddress(cep: string): Promise<string> {
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

// ── Melhor Envio (PAC + SEDEX Correios + Jadlog) ─────────────────────────────

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
    console.warn('[MelhorEnvio] erro de rede/timeout, transportadora omitida:', e instanceof Error ? e.message : e);
    return [];
  }
}

// ── Jadlog (fallback direto sem Melhor Envio) ────────────────────────────────

async function quoteJadlog(
  fromCep: string,
  toCep: string,
  pkg: PackageDimensions,
  productValueCents: number
): Promise<ShippingOption[]> {
  const token   = process.env.JADLOG_TOKEN;
  const account = process.env.JADLOG_ACCOUNT;
  if (!token || !account) {
    return [{ carrier: 'jadlog_package', label: 'Jadlog Package', priceCents: 3200, estimatedDays: 5, available: true, tag: 'economico' as const }];
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  if (results.length === 0) {
    results.push({ carrier: 'jadlog_package', label: 'Jadlog Package', priceCents: 3200, estimatedDays: 5, available: true, tag: 'economico' });
  }

  return results;
}

// ── Correios API REST v2 (fallback sem Melhor Envio) ─────────────────────────

async function quoteCorreiosDireto(
  fromCep: string,
  toCep: string,
  pkg: PackageDimensions,
  productValueCents: number
): Promise<ShippingOption[]> {
  const cartao = process.env.CORREIOS_CARTAO_POSTAGEM;
  const codigo = process.env.CORREIOS_CODIGO_ACESSO;
  if (!cartao || !codigo) return [];

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
            peso: Math.max(300, Math.round(pkg.weightKg * 1000)),
            comprimento: pkg.lengthCm,
            largura: pkg.widthCm,
            altura: pkg.heightCm,
            servicosAdicionais: productValueCents >= 50000 ? ['019'] : [],
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

// ── Função principal — fonte única de verdade de preço de frete ─────────────

export async function computeShippingOptions(
  destCep: string,
  settings: StoreSettings,
  productValueCents: number,
  totalWeightKg: number,
  // Saldo atual do "caixa de frete" (collectedCents - spentCents já gasto de
  // verdade nas transportadoras). Opcional — quando omitido, o frete grátis
  // funciona sem teto (comportamento antigo). Ver src/lib/shipping-ledger.ts.
  ledgerBalanceCents?: number,
): Promise<ShippingQuoteResult> {
  const pkg: PackageDimensions = { weightKg: totalWeightKg, heightCm: 20, widthCm: 40, lengthCm: 50 };

  const freeThreshold = settings.freeShippingThresholdCents ?? 0;
  const thresholdMet  = freeThreshold > 0 && productValueCents >= freeThreshold;

  // Blindagem silenciosa: se o prejuízo acumulado no caixa de frete já
  // ultrapassou o teto configurado, o frete grátis é desligado nessa
  // cotação — sem qualquer sinal disso pro cliente (ele só vê o frete
  // normal, como se o threshold não tivesse sido atingido).
  const maxLossCents = settings.freeShippingMaxLossCents ?? 0;
  const withinBudget  = maxLossCents <= 0 || ledgerBalanceCents === undefined || ledgerBalanceCents > -maxLossCents;
  const freeShipping  = thresholdMet && withinBudget;

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

  const options: ShippingOption[] = [];

  options.push({ carrier: 'pickup', label: 'Retirar na loja', priceCents: 0, estimatedDays: 0, available: true, tag: 'local' });

  // ── Uber Direct (entrega local no mesmo dia) ──────────────────────────────
  const uberSandbox = !!settings.uberDirectSandboxMode;
  let uberDebug: string | undefined;
  if (isLocal) {
    if (uberDirectConfigured(uberSandbox)) {
      try {
        const token = await getUberToken(uberSandbox);
        void token;
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
          quoteId:       quote.quoteId,
        });
      } catch (e) {
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
    const meOptions = await quoteMelhorEnvio(fromCep, destCep, pkg, productValueCents, meToken, sandbox);
    options.push(...meOptions);
  } else if (fromCep) {
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

  if (freeShipping) for (const o of deduped) { o.realPriceCents = o.priceCents; o.priceCents = 0; }
  else for (const o of deduped) o.realPriceCents = o.priceCents;

  deduped.sort((a, b) => a.priceCents !== b.priceCents ? a.priceCents - b.priceCents : a.estimatedDays - b.estimatedDays);

  // Fallback se correios/jadlog não retornaram (sem credenciais configuradas)
  const hasCarrier = deduped.some(o => o.carrier !== 'pickup');
  if (!hasCarrier) {
    deduped.push(
      { carrier: 'correios_pac',   label: 'Correios PAC',   priceCents: freeShipping ? 0 : 2500, realPriceCents: 2500, estimatedDays: 10, available: true, tag: 'economico' },
      { carrier: 'correios_sedex', label: 'Correios SEDEX', priceCents: freeShipping ? 0 : 4500, realPriceCents: 4500, estimatedDays: 3,  available: true, tag: 'rapido'    },
      { carrier: 'jadlog_package', label: 'Jadlog Package', priceCents: freeShipping ? 0 : 3200, realPriceCents: 3200, estimatedDays: 5,  available: true, tag: 'economico' }
    );
  }

  return { options: deduped, distKm, isLocal, freeShipping, uberDebug, uberSandbox };
}
