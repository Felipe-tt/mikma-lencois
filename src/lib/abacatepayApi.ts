/**
 * Chamadas à API v2 da AbacatePay usadas fora da criação da cobrança:
 * consultar status (PIX e checkout de cartão) e estornar.
 *
 * Regras da própria AbacatePay (README do @abacatepay/sdk):
 * - GET pode ser repetido em timeout/5xx.
 * - POST que mexe com dinheiro (estorno) NÃO se repete em timeout: pode ter
 *   sido processado. Aqui ele falha e quem chamou consulta antes de tentar de
 *   novo (o estorno é sempre do valor total e a AbacatePay recusa o segundo).
 */

export const ABACATEPAY_BASE = 'https://api.abacatepay.com/v2';

export function abacatePayKey(sandbox: boolean): string {
  return (sandbox ? process.env.ABACATEPAY_SANDBOX_API_KEY : process.env.ABACATEPAY_API_KEY) ?? '';
}

export type AbacateResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function request<T>(path: string, sandbox: boolean, init: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number } = {}): Promise<AbacateResult<T>> {
  const key = abacatePayKey(sandbox);
  if (!key) return { ok: false, status: 0, error: 'Chave da AbacatePay não configurada' };
  const method = init.method ?? 'GET';
  const attempts = method === 'GET' ? 2 : 1;
  let last: AbacateResult<T> = { ok: false, status: 0, error: 'sem resposta' };
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${ABACATEPAY_BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${key}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null) as { data?: T; error?: string | null; success?: boolean } | null;
      if (res.ok && json && json.success !== false && json.data != null) return { ok: true, data: json.data };
      last = { ok: false, status: res.status, error: (json?.error as string) || `HTTP ${res.status}` };
      if (res.status < 500 && res.status !== 429) return last;
    } catch (err) {
      last = { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return last;
}

export type ChargeStatus = 'PENDING' | 'EXPIRED' | 'CANCELLED' | 'PAID' | 'APPROVED' | 'UNDER_DISPUTE' | 'REFUNDED' | 'REDEEMED' | 'FAILED' | 'ACTIVE';

/** Status do PIX transparente (`pix_char_...`). Sem cache, feito para polling. */
export function checkPixStatus(txId: string, sandbox: boolean) {
  return request<{ id: string; status: ChargeStatus; expiresAt: string }>(`/transparents/check?id=${encodeURIComponent(txId)}`, sandbox);
}

/** Status do checkout de cartão (`bill_...`). */
export function getCheckoutStatus(checkoutId: string, sandbox: boolean) {
  return request<{ id: string; status: ChargeStatus; externalId: string | null }>(`/checkouts/get?id=${encodeURIComponent(checkoutId)}`, sandbox);
}

export interface AbacateRefund { id: string; status: string; amount: number; reason: string | null; originalId: string }

/**
 * Estorno total. Cobrança transparente (PIX `pix_char_` ou cartão `card_`):
 * /transparents/refund. Cartão pela página da AbacatePay: /checkouts/refund
 * com o `bill_`.
 */
export function refundCharge(kind: 'transparent' | 'checkout', id: string, reason: string, sandbox: boolean) {
  const path = kind === 'transparent' ? '/transparents/refund' : '/checkouts/refund';
  return request<AbacateRefund>(path, sandbox, { method: 'POST', body: { id, reason: reason.slice(0, 500) }, timeoutMs: 30_000 });
}

// ── Cartão no próprio site (checkout transparente) ──────────────────────────

export interface CardCharge {
  id: string;             // card_...
  amount: number;
  status: ChargeStatus;
  brand?: string;
  lastFour?: string;
  installmentCount?: number;
  installmentAmount?: number;
}

/**
 * Cobra o cartão com o token `ctok_` gerado pelo abacatepay.js no navegador
 * (docs: Criar cobrança Cartão). O `amount` precisa ser o mesmo usado no
 * AbacatePay.create da página. Sem nova tentativa: timeout não é recusa, a
 * cobrança pode ter passado (status 0 = sem resposta; quem chama trata).
 */
export function createCardCharge(input: {
  token: string;
  amount: number;
  installments: number;
  customer: { name: string; email: string; taxId: string; cellphone: string };
  metadata: Record<string, string>;
  sandbox: boolean;
}) {
  return request<CardCharge>('/transparents/create', input.sandbox, {
    method: 'POST',
    timeoutMs: 45_000,
    body: {
      method: 'CARD',
      data: {
        amount: input.amount,
        token: input.token,
        installmentCount: input.installments,
        customer: input.customer,
        metadata: input.metadata,
      },
    },
  });
}

/** Uma cobrança transparente pelo id (cartão usa esta; /check é só PIX). */
export function getTransparent(id: string, sandbox: boolean) {
  return request<{ id: string; status: ChargeStatus }>(`/transparents/get?id=${encodeURIComponent(id)}`, sandbox);
}
