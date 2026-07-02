/**
 * src/lib/uber-direct.ts
 * Cliente centralizado para a API Uber Direct (entrega local sob demanda).
 *
 * CREDENCIAIS necessárias (configurar no .env.local e no Cloud Run):
 *   UBER_DIRECT_CLIENT_ID      — developer.uber.com → seu app
 *   UBER_DIRECT_CLIENT_SECRET  — developer.uber.com → seu app
 *   UBER_DIRECT_CUSTOMER_ID    — direct.uber.com → configurações da conta
 *   UBER_DIRECT_WEBHOOK_SECRET — developer.uber.com → Webhooks → segredo de assinatura
 *   UBER_DIRECT_SANDBOX=true   — usar sandbox (omitir ou false em produção)
 *
 * COMO OBTER:
 *   1. Acesse https://developer.uber.com/dashboard e crie um app
 *   2. Em "Products", habilite "Delivery" (Uber Direct)
 *   3. Copie Client ID e Client Secret
 *   4. Acesse https://direct.uber.com → Settings → API Access → copie Customer ID
 *   5. Em developer.uber.com → seu app → Webhooks → crie um webhook apontando para
 *      https://mikma.com.br/api/shipping/uber-webhook e copie o signing secret
 */

import { adminDb } from '@/lib/firebase/admin';

const SANDBOX  = process.env.UBER_DIRECT_SANDBOX === 'true';
const AUTH_URL = SANDBOX
  ? 'https://sandbox-login.uber.com/oauth/v2/token'
  : 'https://login.uber.com/oauth/v2/token';
const API_BASE = SANDBOX
  ? 'https://sandbox-api.uber.com/v1'
  : 'https://api.uber.com/v1';

// ── Token OAuth2 (client_credentials, cache no Firestore) ────────────────────

export async function getUberToken(): Promise<string> {
  const clientId     = process.env.UBER_DIRECT_CLIENT_ID;
  const clientSecret = process.env.UBER_DIRECT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('UBER_DIRECT_CLIENT_ID / UBER_DIRECT_CLIENT_SECRET não configurados');
  }

  // Token pode durar horas — cacheia pra não bater no auth em toda requisição
  try {
    const snap = await adminDb.collection('_cache').doc('uber_token').get();
    if (snap.exists) {
      const d = snap.data()!;
      if (d.token && d.expiresAt && Date.now() < d.expiresAt - 60_000) return d.token as string;
    }
  } catch { /* cache miss, prossegue */ }

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normaliza fee da API (pode vir em centavos ou em reais dependendo do endpoint/região) */
function normalizeFee(raw: unknown): number {
  if (typeof raw !== 'number' || raw === 0) return 0;
  // Heurística: se o valor for >= 100 provavelmente já está em centavos (R$1,00+)
  return raw >= 100 ? raw : Math.round(raw * 100);
}

/** Formata número de telefone para E.164 (+55...) */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return `+${digits}`;
  return `+55${digits}`;
}

// ── Quote ─────────────────────────────────────────────────────────────────────

export interface UberQuoteResult {
  quoteId:   string;
  feeCents:  number;
  expiresAt: string; // ISO
}

/**
 * Cota uma entrega sem criá-la. Útil para exibir o preço no checkout.
 * O quoteId pode ser reaproveitado em uberCreateDelivery se ainda não expirou.
 * Endereços devem ser strings geocodificáveis, ex:
 *   "Rua XV de Novembro, 234, Centro, Blumenau, SC, 89010-400, BR"
 */
export async function uberQuote(
  pickupAddress: string,
  dropoffAddress: string,
): Promise<UberQuoteResult> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID;
  if (!customerId) throw new Error('UBER_DIRECT_CUSTOMER_ID não configurado');

  const token = await getUberToken();
  const res = await fetch(`${API_BASE}/customers/${customerId}/delivery_quotes`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ pickup_address: pickupAddress, dropoff_address: dropoffAddress }),
    signal:  AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Uber Direct quote falhou: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    quoteId:   data.id ?? data.quote_id ?? '',
    feeCents:  normalizeFee(data.fee ?? data.total_fee),
    expiresAt: data.expires ?? new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

// ── Criar entrega ─────────────────────────────────────────────────────────────

export interface UberCreateParams {
  orderId:         string;
  quoteId?:        string; // reaproveitado se ainda válido — economiza nova cobrança
  pickupName:      string;
  pickupAddress:   string;
  pickupPhone:     string; // formato E.164, ex: +5547999999999
  dropoffName:     string;
  dropoffAddress:  string;
  dropoffPhone:    string;
  itemDescription: string; // resumo do pedido, max 280 chars
}

export interface UberCreateResult {
  deliveryId:  string;
  trackingUrl: string;
  feeCents:    number;
  status:      string; // 'pending' inicialmente
}

export async function uberCreateDelivery(params: UberCreateParams): Promise<UberCreateResult> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID;
  if (!customerId) throw new Error('UBER_DIRECT_CUSTOMER_ID não configurado');

  const token = await getUberToken();
  const body: Record<string, unknown> = {
    pickup: {
      name:         params.pickupName,
      address:      params.pickupAddress,
      phone_number: params.pickupPhone,
    },
    dropoff: {
      name:         params.dropoffName,
      address:      params.dropoffAddress,
      phone_number: params.dropoffPhone,
    },
    manifest: {
      reference:   params.orderId,
      description: params.itemDescription.slice(0, 280),
    },
  };
  if (params.quoteId) body.quote_id = params.quoteId;

  const res = await fetch(`${API_BASE}/customers/${customerId}/deliveries`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Uber Direct create delivery falhou: ${res.status} ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    deliveryId:  data.id,
    trackingUrl: data.tracking_url ?? '',
    feeCents:    normalizeFee(data.fee ?? data.total_fee),
    status:      data.status ?? 'pending',
  };
}

// ── Consultar status ──────────────────────────────────────────────────────────

export interface UberDeliveryStatus {
  status:           string; // pending | pickup | pickup_complete | dropoff | delivered | cancelled | returned
  trackingUrl:      string;
  courierName?:     string;
  courierPhone?:    string;
  estimatedPickup?: string; // ISO
  estimatedDropoff?: string; // ISO
}

export async function uberGetDelivery(deliveryId: string): Promise<UberDeliveryStatus> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID;
  if (!customerId) throw new Error('UBER_DIRECT_CUSTOMER_ID não configurado');

  const token = await getUberToken();
  const res = await fetch(`${API_BASE}/customers/${customerId}/deliveries/${deliveryId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Uber Direct get delivery falhou: ${res.status}`);

  const d = await res.json();
  return {
    status:            d.status,
    trackingUrl:       d.tracking_url ?? '',
    courierName:       d.courier?.name,
    courierPhone:      d.courier?.phone_number,
    estimatedPickup:   d.pickup?.eta,
    estimatedDropoff:  d.dropoff?.eta,
  };
}

// ── Cancelar ──────────────────────────────────────────────────────────────────

export async function uberCancelDelivery(deliveryId: string): Promise<void> {
  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID;
  if (!customerId) throw new Error('UBER_DIRECT_CUSTOMER_ID não configurado');

  const token = await getUberToken();
  const res = await fetch(`${API_BASE}/customers/${customerId}/deliveries/${deliveryId}/cancel`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Uber Direct cancel falhou: ${res.status} ${err.slice(0, 200)}`);
  }
}
