import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verificação dos webhooks da AbacatePay, nos esquemas que a API v2 usa
 * (fonte: @abacatepay/adapters e @abacatepay/types, pacotes oficiais):
 *
 * 1. Standard Webhooks (https://www.standardwebhooks.com), usado pelos
 *    endpoints criados depois do corte: cabeçalhos `webhook-id`,
 *    `webhook-timestamp` e `webhook-signature` ("v1,<base64>"), HMAC-SHA256
 *    de `${id}.${timestamp}.${corpo}` com o segredo `whsec_...`.
 * 2. Legado oficial: `?webhookSecret=` na URL igual ao segredo do endpoint
 *    E `X-Webhook-Signature` = HMAC-SHA256 base64 do corpo com a chave
 *    pública da AbacatePay (a mesma para todos; a autenticação de verdade é
 *    o webhookSecret da URL).
 * 3. O formato que esta loja verificava até agora (`X-AbacatePay-Signature`
 *    com HMAC do corpo usando o próprio segredo), mantido para não derrubar
 *    um endpoint que já esteja funcionando assim.
 */

// Chave pública publicada pela AbacatePay em @abacatepay/adapters/webhooks.
export const ABACATEPAY_PUBLIC_HMAC_KEY = 't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';

/** Tolerância de relógio do Standard Webhooks (contra replay). */
const TOLERANCE_SECONDS = 5 * 60;

export type WebhookScheme = 'standard' | 'legacy' | 'store';
export type WebhookVerification =
  | { ok: true; scheme: WebhookScheme; deliveryId: string | null }
  | { ok: false; reason: string };

interface HeaderLike { get(name: string): string | null }

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

function hmacBase64(key: string | Buffer, content: string): string {
  return createHmac('sha256', key).update(Buffer.from(content, 'utf8')).digest('base64');
}

export function verifyAbacateWebhook(
  rawBody: string,
  headers: HeaderLike,
  searchParams: URLSearchParams,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): WebhookVerification {
  if (!secret) return { ok: false, reason: 'ABACATEPAY_WEBHOOK_SECRET não configurado' };

  // 1. Standard Webhooks
  const stdSignature = headers.get('webhook-signature');
  if (stdSignature) {
    const id = headers.get('webhook-id');
    const ts = headers.get('webhook-timestamp');
    if (!id || !ts) return { ok: false, reason: 'cabeçalhos webhook-id/timestamp ausentes' };
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(nowSeconds - tsNum) > TOLERANCE_SECONDS) {
      return { ok: false, reason: 'timestamp fora da tolerância' };
    }
    const key = secret.startsWith('whsec_') ? Buffer.from(secret.slice(6), 'base64') : Buffer.from(secret, 'utf8');
    const expected = hmacBase64(key, `${id}.${ts}.${rawBody}`);
    const matches = stdSignature.split(' ').some(part => {
      const [version, sig] = part.split(',');
      return version === 'v1' && !!sig && safeEqual(sig, expected);
    });
    return matches ? { ok: true, scheme: 'standard', deliveryId: id } : { ok: false, reason: 'assinatura standard inválida' };
  }

  // 2. Legado oficial
  const legacySignature = headers.get('x-webhook-signature');
  if (legacySignature) {
    const urlSecret = searchParams.get('webhookSecret') ?? '';
    if (!safeEqual(urlSecret, secret)) return { ok: false, reason: 'webhookSecret da URL não confere' };
    if (!safeEqual(legacySignature, hmacBase64(ABACATEPAY_PUBLIC_HMAC_KEY, rawBody))) {
      return { ok: false, reason: 'X-Webhook-Signature inválida' };
    }
    return { ok: true, scheme: 'legacy', deliveryId: null };
  }

  // 3. Formato antigo desta loja
  const storeSignature = headers.get('x-abacatepay-signature');
  if (storeSignature && safeEqual(storeSignature, hmacBase64(secret, rawBody))) {
    return { ok: true, scheme: 'store', deliveryId: null };
  }

  return { ok: false, reason: 'nenhuma assinatura válida' };
}
