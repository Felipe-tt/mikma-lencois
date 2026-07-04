/**
 * src/lib/uber-direct.ts
 * Cliente Uber Direct baseado no OpenAPI oficial (openapi.json).
 *
 * CREDENCIAIS (configurar no Cloud Run → Variáveis de ambiente):
 *   UBER_DIRECT_CLIENT_ID      — developer.uber.com → seu app → Credentials
 *   UBER_DIRECT_CLIENT_SECRET  — developer.uber.com → seu app → Credentials
 *   UBER_DIRECT_CUSTOMER_ID    — developer.uber.com → seu app → Customer ID
 *   UBER_DIRECT_WEBHOOK_SECRET — developer.uber.com → seu app → Webhooks
 *   UBER_DIRECT_SANDBOX=true   — remover em produção
 */

import { adminDb } from '@/lib/firebase/admin';

const SANDBOX  = process.env.UBER_DIRECT_SANDBOX === 'true';
// Auth URL conforme securitySchemes.direct_auth.flows.clientCredentials.tokenUrl do OpenAPI
const AUTH_URL = SANDBOX
  ? 'https://auth.uber.com/oauth/v2/token'   // sandbox usa o mesmo endpoint
  : 'https://auth.uber.com/oauth/v2/token';
const API_BASE = SANDBOX
  ? 'https://sandbox-api.uber.com/v1'
  : 'https://api.uber.com/v1';

// ── Token OAuth2 ──────────────────────────────────────────────────────────────

export async function getUberToken(): Promise<string> {
  const clientId     = process.env.UBER_DIRECT_CLIENT_ID;
  const clientSecret = process.env.UBER_DIRECT_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error('UBER_DIRECT_CLIENT_ID / UBER_DIRECT_CLIENT_SECRET não configurados');

  try {
    const snap = await adminDb.collection('_cache').doc('uber_token').get();
    if (snap.exists) {
      const d = snap.data()!;
      if (d.token && d.expiresAt && Date.now() < d.expiresAt - 60_000) return d.token as string;
    }
  } catch { /* cache miss */ }

  const res = await fetch(AUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'client_credentials',
      scope:         'eats.deliveries',
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Uber Direct OAuth falhou: ${res.status} ${err.slice(0, 200)}`);
  }

  const data      = await res.json();
  const token     = data.access_token as string;
  const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  adminDb.collection('_cache').doc('uber_token').set({ token, expiresAt }).catch(() => {});
  return token;
}

// ── Formato de endereço ───────────────────────────────────────────────────────
// A API Uber Direct exige um JSON STRING escapado no campo pickup_address /
// dropoff_address — NÃO uma string de texto puro.
// Exemplo: "{\"street_address\":[\"Rua XV de Novembro, 234\"],\"city\":\"Blumenau\",
//            \"state\":\"SC\",\"zip_code\":\"89010400\",\"country\":\"BR\"}"

export interface UberAddressInput {
  street:       string;   // logradouro
  number?:      string;
  complement?:  string;
  city:         string;
  state:        string;   // sigla, ex: "SC"
  zipCode:      string;
  country?:     string;   // padrão "BR"
}

export function buildUberAddress(a: UberAddressInput): string {
  const streetLine = [a.street, a.number, a.complement].filter(Boolean).join(', ');
  return JSON.stringify({
    street_address: [streetLine],
    city:           a.city,
    state:          a.state,
    zip_code:       a.zipCode.replace(/\D/g, ''),
    country:        a.country ?? 'BR',
  });
}

// ── Formatar telefone para E.164 (+55...) ────────────────────────────────────

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return `+${digits}`;
  return `+55${digits}`;
}

// ── Quote ─────────────────────────────────────────────────────────────────────

export interface UberQuoteResult {
  quoteId:      string;
  feeCents:     number;  // sempre em centavos (integer)
  expiresAt:    string;  // ISO
  dropoffEta?:  string;  // ISO — previsão de entrega
  durationMin?: number;  // minutos estimados
}

/**
 * POST /customers/{customer_id}/delivery_quotes
 * pickup_address e dropoff_address são JSON strings (use buildUberAddress).
 */
export async function uberQuote(
  pickupAddress:  string,  // JSON string
  dropoffAddress: string,  // JSON string
): Promise<UberQuoteResult> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID;
  if (!customerId) throw new Error('UBER_DIRECT_CUSTOMER_ID não configurado');

  const token = await getUberToken();
  const res   = await fetch(`${API_BASE}/customers/${customerId}/delivery_quotes`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ pickup_address: pickupAddress, dropoff_address: dropoffAddress }),
    signal:  AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Uber Direct quote falhou: ${res.status} ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  // fee é sempre integer em centavos conforme spec (ex: 600 = R$6,00)
  return {
    quoteId:      data.id ?? '',
    feeCents:     data.fee ?? 0,
    expiresAt:    data.expires ?? new Date(Date.now() + 5 * 60_000).toISOString(),
    dropoffEta:   data.dropoff_eta,
    durationMin:  data.duration,
  };
}

// ── Criar entrega ─────────────────────────────────────────────────────────────

export interface UberManifestItem {
  name:      string;
  quantity:  number;   // inteiro >= 1
  size?:     'small' | 'medium' | 'large' | 'xlarge'; // padrão: small
  price?:    number;   // centavos
  weight?:   number;   // gramas
}

export interface UberCreateParams {
  orderId:              string;
  quoteId?:             string;
  pickupName:           string;
  pickupAddress:        string;  // JSON string (buildUberAddress)
  pickupPhoneNumber:    string;  // E.164
  pickupNotes?:         string;
  dropoffName:          string;
  dropoffAddress:       string;  // JSON string (buildUberAddress)
  dropoffPhoneNumber:   string;  // E.164
  dropoffNotes?:        string;
  manifestItems:        UberManifestItem[];
  manifestTotalValue?:  number;  // centavos — valor total dos itens
}

export interface UberCreateResult {
  deliveryId:   string;
  trackingUrl:  string;
  feeCents:     number;
  status:       string;
  pickupEta?:   string;
  dropoffEta?:  string;
}

/**
 * POST /customers/{customer_id}/deliveries
 * Campos OBRIGATÓRIOS: pickup_name, pickup_address, pickup_phone_number,
 *                      dropoff_name, dropoff_address, dropoff_phone_number,
 *                      manifest_items (array)
 */
export async function uberCreateDelivery(params: UberCreateParams): Promise<UberCreateResult> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID;
  if (!customerId) throw new Error('UBER_DIRECT_CUSTOMER_ID não configurado');

  const token = await getUberToken();

  const body: Record<string, unknown> = {
    // Pickup — OBRIGATÓRIOS
    pickup_name:         params.pickupName,
    pickup_address:      params.pickupAddress,
    pickup_phone_number: params.pickupPhoneNumber,
    // Dropoff — OBRIGATÓRIOS
    dropoff_name:         params.dropoffName,
    dropoff_address:      params.dropoffAddress,
    dropoff_phone_number: params.dropoffPhoneNumber,
    // Manifest — OBRIGATÓRIO (array de itens)
    manifest_items:       params.manifestItems,
    // Referência do pedido (visível para o entregador no app)
    manifest_reference:   params.orderId,
    // external_id: mesma referência — torna o pedido pesquisável no dashboard Uber
    external_id:          params.orderId,
    // Chave de idempotência — previne entregas duplicadas se o request for repetido
    // Combinado com manifest_reference, external_id deve ser único (per spec)
    idempotency_key:      params.orderId,
  };

  if (params.quoteId)             body.quote_id            = params.quoteId;
  if (params.pickupNotes)         body.pickup_notes        = params.pickupNotes.slice(0, 280);
  if (params.dropoffNotes)        body.dropoff_notes       = params.dropoffNotes.slice(0, 280);
  if (params.manifestTotalValue)  body.manifest_total_value = params.manifestTotalValue;

  const res = await fetch(`${API_BASE}/customers/${customerId}/deliveries`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Uber Direct create delivery falhou: ${res.status} ${err.slice(0, 400)}`);
  }

  const data = await res.json();
  return {
    deliveryId:  data.id,
    trackingUrl: data.tracking_url ?? '',
    feeCents:    data.fee ?? 0,
    status:      data.status ?? 'pending',
    pickupEta:   data.pickup_eta,
    dropoffEta:  data.dropoff_eta,
  };
}

// ── Consultar status ──────────────────────────────────────────────────────────

export interface UberDeliveryStatus {
  status:            string;
  trackingUrl:       string;
  courierName?:      string;
  courierPhone?:     string;
  courierVehicle?:   string;
  pickupEta?:        string;
  dropoffEta?:       string;
  complete:          boolean;
}

/** GET /customers/{customer_id}/deliveries/{delivery_id} */
export async function uberGetDelivery(deliveryId: string): Promise<UberDeliveryStatus> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID;
  if (!customerId) throw new Error('UBER_DIRECT_CUSTOMER_ID não configurado');

  const token = await getUberToken();
  const res   = await fetch(`${API_BASE}/customers/${customerId}/deliveries/${deliveryId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Uber Direct get delivery falhou: ${res.status}`);

  const d = await res.json();
  // Campos conforme GetDeliveryResp + CourierInfo do OpenAPI
  return {
    status:          d.status,
    trackingUrl:     d.tracking_url ?? '',
    courierName:     d.courier?.name,
    courierPhone:    d.courier?.phone_number,
    courierVehicle:  d.courier?.vehicle_type,  // vehicle_type em CourierInfo
    pickupEta:       d.pickup_eta,
    dropoffEta:      d.dropoff_eta,
    complete:        d.complete ?? false,
  };
}

// ── Cancelar ──────────────────────────────────────────────────────────────────

/**
 * POST /customers/{customer_id}/deliveries/{delivery_id}/cancel
 * Body: CancelDeliveryReq — cancelation_reason (obrigatório se reason=other) + additional_description
 * Valores válidos: out_of_items | store_closed | customer_called_to_cancel | store_too_busy |
 *                  courier_delayed_en_route_to_pickup | too_expensive |
 *                  customer_changed_order_requirements | delivery_vehicle_too_small |
 *                  no_courier_assigned | other
 */
export async function uberCancelDelivery(
  deliveryId: string,
  reason: string = 'customer_called_to_cancel',
  additionalDescription?: string,
): Promise<void> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID;
  if (!customerId) throw new Error('UBER_DIRECT_CUSTOMER_ID não configurado');

  const token = await getUberToken();
  const body: Record<string, string> = { cancelation_reason: reason };
  if (additionalDescription) body.additional_description = additionalDescription;

  const res = await fetch(
    `${API_BASE}/customers/${customerId}/deliveries/${deliveryId}/cancel`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(8000),
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Uber Direct cancel falhou: ${res.status} ${err.slice(0, 200)}`);
  }
}
