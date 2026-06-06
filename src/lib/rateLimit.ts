/**
 * In-memory rate limiter — funciona por instância Cloud Run.
 * Para multi-instância em produção de alto tráfego, substituir por Redis/Upstash.
 * No Vercel/Cloud Run com uma instância isso é suficiente para proteção básica.
 */

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();

/**
 * @returns true = permitido, false = bloqueado
 */
export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;

  entry.count++;
  return true;
}

/**
 * Retorna quanto tempo (ms) falta para o rate limit resetar.
 */
export function rateLimitRetryAfter(key: string): number {
  const entry = store.get(key);
  if (!entry) return 0;
  return Math.max(0, entry.resetAt - Date.now());
}

// Limpa entradas expiradas a cada 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);
