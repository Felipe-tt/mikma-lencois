/**
 * Rate limiter com Upstash Redis (free tier) como backend principal e
 * fallback automático para um contador em memória (por instância) se o
 * Upstash não estiver configurado, falhar, ou estourar timeout/quota.
 *
 * Por quê fallback em memória e não só falhar aberto/fechado: o site não
 * pode ficar sem proteção nenhuma (falhar aberto) nem travar rotas de
 * auth/checkout por causa de uma instabilidade externa (falhar fechado).
 * O fallback local já era o que existia antes do Upstash e é suficiente
 * como rede de segurança — pior caso é reset por instância, mas o site
 * nunca para de funcionar.
 */

import { Redis } from '@upstash/redis';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis =
  UPSTASH_URL && UPSTASH_TOKEN
    ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN })
    : null;

// Timeout curto pra chamada ao Upstash: se a rede/serviço estiver lento,
// cai pro fallback em memória em vez de segurar a requisição do usuário.
const UPSTASH_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('upstash_timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// ── Fallback em memória (idêntico ao rate limiter original) ──────────────────

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();

function memoryRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
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

// Mantém uma estimativa local de resetAt mesmo quando quem decidiu foi o
// Upstash — só pra rateLimitRetryAfter() ter algo razoável pra reportar
// (ex: no header Retry-After), sem precisar de round-trip extra ao Redis.
function trackResetEstimate(key: string, windowMs: number) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 0, resetAt: now + windowMs });
  }
}

// Limpa entradas expiradas a cada 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

// ── Upstash (janela fixa via INCR + EXPIRE) ───────────────────────────────────

async function upstashRateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
  if (!redis) throw new Error('upstash_not_configured');

  const redisKey = `ratelimit:${key}`;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  const count = await withTimeout(redis.incr(redisKey), UPSTASH_TIMEOUT_MS);
  if (count === 1) {
    // Primeira requisição da janela: define o TTL agora.
    await withTimeout(redis.expire(redisKey, windowSeconds), UPSTASH_TIMEOUT_MS);
  }

  return count <= maxRequests;
}

/**
 * @returns true = permitido, false = bloqueado
 *
 * Tenta Upstash primeiro; qualquer erro (não configurado, timeout, quota
 * estourada, rede fora) cai automaticamente pro rate limiter em memória.
 */
export async function rateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
  trackResetEstimate(key, windowMs);

  if (redis) {
    try {
      return await upstashRateLimit(key, maxRequests, windowMs);
    } catch {
      // Upstash falhou (quota, rede, timeout etc.) — fallback silencioso.
      return memoryRateLimit(key, maxRequests, windowMs);
    }
  }

  return memoryRateLimit(key, maxRequests, windowMs);
}

/**
 * Retorna quanto tempo (ms) falta para o rate limit resetar.
 * Baseado na estimativa local — suficiente pro header Retry-After, mesmo
 * quando quem decidiu o bloqueio foi o Upstash.
 */
export function rateLimitRetryAfter(key: string): number {
  const entry = store.get(key);
  if (!entry) return 0;
  return Math.max(0, entry.resetAt - Date.now());
}
