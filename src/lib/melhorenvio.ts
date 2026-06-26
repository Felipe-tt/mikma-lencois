/**
 * Melhor Envio API v2
 * Docs: https://docs.melhorenvio.com.br
 *
 * Fluxo completo para despacho:
 * 1. /me/shipment/calculate  — cotação de frete (feita no checkout)
 * 2. /me/cart                — adiciona envio ao carrinho ME
 * 3. /me/shipment/checkout   — compra o envio (debita saldo ME)
 * 4. /me/shipment/generate   — gera a etiqueta
 * 5. /me/shipment/print      — URL do PDF para imprimir
 * 6. Rastreio via /me/shipment/tracking ou webhook
 *
 * Requer: MELHOR_ENVIO_TOKEN (OAuth token da conta)
 * Para obter: https://melhorenvio.com.br/painel/gerenciar/tokens
 */

const ME_BASE = process.env.MELHOR_ENVIO_SANDBOX === 'true'
  ? 'https://sandbox.melhorenvio.com.br/api/v2'
  : 'https://melhorenvio.com.br/api/v2';

const ME_TOKEN  = () => process.env.MELHOR_ENVIO_TOKEN ?? '';
const ME_AGENT  = 'MikmaLencois/1.0 (contato@mikma.com.br)';

// ID dos serviços no Melhor Envio
// 1 = Correios PAC, 2 = Correios SEDEX, 3 = PAC Mini, 7 = Jadlog Package, 18 = Jadlog .com
export const ME_SERVICES: Record<string, number> = {
  correios_pac:       1,
  correios_sedex:     2,
  jadlog_package:     7,
  jadlog_expresso:    18,
};

export type MECartItem = {
  id: string;               // ID do item no carrinho ME
  protocol: string;         // Número do protocolo
  service_id: number;
};

export type MEShipmentStatus = {
  id: string;
  protocol: string;
  status: string;           // pending | released | posted | delivered | canceled
  tracking: string | null;
  tracking_url: string | null;
};

async function mePost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${ME_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ME_TOKEN()}`,
      'User-Agent': ME_AGENT,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MelhorEnvio ${path} ${res.status}: ${text.slice(0, 300)}`);
  }

  try { return JSON.parse(text) as T; }
  catch { throw new Error(`MelhorEnvio ${path} parse error: ${text.slice(0, 200)}`); }
}

async function meGet<T>(path: string): Promise<T> {
  const res = await fetch(`${ME_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${ME_TOKEN()}`,
      'User-Agent': ME_AGENT,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MelhorEnvio GET ${path} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface MEAddress {
  name: string;
  phone: string;
  email: string;
  document: string; // CPF (apenas dígitos)
  company_document?: string; // CNPJ
  address: string;
  complement?: string;
  number: string;
  district: string;
  city: string;
  country_id: string; // 'BR'
  postal_code: string;
  state_abbr: string;
}

export interface MEProduct {
  name: string;
  quantity: number;
  unitary_value: number; // reais
}

export interface MEPackage {
  weight: number; // kg
  width: number;  // cm
  height: number; // cm
  length: number; // cm
}

// ── 1. Calcular frete (cotação) ───────────────────────────────────────────────
// Já existe em /api/shipping/quote — não duplicar aqui.

// ── 2. Adicionar ao carrinho ME ───────────────────────────────────────────────

export async function meAddToCart(params: {
  serviceId: number;      // ME_SERVICES[carrier]
  orderId: string;        // referência interna
  from: MEAddress;
  to: MEAddress;
  products: MEProduct[];
  volumes: MEPackage[];
  insuranceValue: number; // valor declarado em reais
}): Promise<MECartItem> {
  const item = await mePost<MECartItem>('/me/cart', {
    service: params.serviceId,
    from: params.from,
    to: params.to,
    products: params.products,
    volumes: params.volumes,
    options: {
      insurance_value: params.insuranceValue,
      receipt: false,
      own_hand: false,
      collect: false,
      tags: [{ tag: params.orderId, url: null }],
    },
  });
  return item;
}

// ── 3. Comprar envio (checkout ME — debita saldo) ─────────────────────────────

export async function meCheckout(cartIds: string[]): Promise<{ purchase: { id: string } }> {
  return mePost('/me/shipment/checkout', {
    orders: cartIds,
  });
}

// ── 4. Gerar etiqueta ─────────────────────────────────────────────────────────

export async function meGenerate(orderIds: string[]): Promise<void> {
  await mePost('/me/shipment/generate', {
    orders: orderIds,
  });
}

// ── 5. Obter URL do PDF de impressão ─────────────────────────────────────────

export async function mePrint(orderIds: string[]): Promise<{ url: string }> {
  return mePost('/me/shipment/print', {
    orders: orderIds,
    mode: 'public', // URL pública, não precisa de autenticação para abrir
  });
}

// ── 6. Rastrear ───────────────────────────────────────────────────────────────

export async function meTracking(orderIds: string[]): Promise<MEShipmentStatus[]> {
  const ids = orderIds.join(',');
  return meGet(`/me/shipment/tracking?orders=${ids}`);
}

// ── 7. Cancelar envio ─────────────────────────────────────────────────────────
// reason_id varia conforme a lista atual de motivos do Melhor Envio.
// Usamos um valor genérico ("outros"/erro operacional) e colocamos o
// motivo real em texto livre na description — é o que importa de fato
// para qualquer disputa/suporte.
export async function meCancel(meOrderId: string, description: string): Promise<void> {
  await mePost('/me/shipment/cancel', {
    order: { id: meOrderId },
    reason_id: 6,
    description: description.slice(0, 255),
  });
}

// ── Fluxo completo: adiciona + compra + gera + imprime ────────────────────────

export async function meDispatch(params: {
  serviceId: number;
  orderId: string;
  from: MEAddress;
  to: MEAddress;
  products: MEProduct[];
  volumes: MEPackage[];
  insuranceValue: number;
}): Promise<{
  meOrderId: string;
  trackingCode: string | null;
  labelUrl: string;
}> {
  // 1. Adiciona ao carrinho
  const cartItem = await meAddToCart(params);
  const meOrderId = cartItem.id;

  // 2. Compra (debita saldo ME)
  await meCheckout([meOrderId]);

  // 3. Gera etiqueta
  await meGenerate([meOrderId]);

  // 4. Obtém PDF
  const print = await mePrint([meOrderId]);

  // 5. Tenta obter código de rastreio (pode demorar alguns segundos)
  let trackingCode: string | null = null;
  try {
    const tracking = await meTracking([meOrderId]);
    trackingCode = tracking[0]?.tracking ?? null;
  } catch { /* rastreio pode não estar disponível imediatamente */ }

  return { meOrderId, trackingCode, labelUrl: print.url };
}
