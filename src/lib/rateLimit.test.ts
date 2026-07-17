import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Estes testes cobrem o fallback em memória, que precisa continuar
// funcionando de forma 100% determinística mesmo que o Upstash esteja
// configurado no ambiente (ex: secrets do CI). Sem esse mock, se
// UPSTASH_REDIS_REST_URL/TOKEN estiverem presentes (como no CI, depois
// que os secrets foram criados), rateLimit() passaria a fazer chamadas
// de rede de verdade pro Upstash — lento, não-determinístico, e incompatível
// com vi.useFakeTimers() (a chamada real de rede não avança com
// vi.advanceTimersByTime(), causando falhas intermitentes).
//
// Mockando o client aqui, toda chamada .incr()/.expire() falha na hora
// (sem round-trip de rede nenhum), o que faz rateLimit() cair pro
// fallback em memória sempre — é exatamente esse caminho que este
// arquivo testa.
vi.mock('@upstash/redis', () => ({
  Redis: class {
    incr() {
      return Promise.reject(new Error('mock: upstash indisponível em teste'));
    }
    expire() {
      return Promise.reject(new Error('mock: upstash indisponível em teste'));
    }
  },
}));

import { rateLimit, rateLimitRetryAfter } from './rateLimit';

// Cada teste usa uma key única (crypto.randomUUID) pra não interferir com
// outros testes, já que o store é um Map no nível do módulo (compartilhado
// entre chamadas, do jeito que seria compartilhado entre requests reais
// numa mesma instância do servidor).
function uniqueKey() {
  return `test:${Math.random().toString(36).slice(2)}`;
}

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('permite até o limite de requisições dentro da janela', async () => {
    const key = uniqueKey();
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
  });

  it('bloqueia a partir da requisição que excede o limite', async () => {
    const key = uniqueKey();
    await rateLimit(key, 2, 60_000);
    await rateLimit(key, 2, 60_000);
    expect(await rateLimit(key, 2, 60_000)).toBe(false);
  });

  it('reseta a contagem depois que a janela expira', async () => {
    const key = uniqueKey();
    await rateLimit(key, 1, 60_000);
    expect(await rateLimit(key, 1, 60_000)).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(await rateLimit(key, 1, 60_000)).toBe(true);
  });

  it('mantém keys diferentes isoladas entre si', async () => {
    const keyA = uniqueKey();
    const keyB = uniqueKey();
    await rateLimit(keyA, 1, 60_000);
    expect(await rateLimit(keyA, 1, 60_000)).toBe(false);
    // key diferente não deveria ser afetada pelo limite de keyA
    expect(await rateLimit(keyB, 1, 60_000)).toBe(true);
  });
});

describe('rateLimitRetryAfter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna 0 para uma key nunca usada', () => {
    expect(rateLimitRetryAfter(uniqueKey())).toBe(0);
  });

  it('retorna o tempo restante até o reset da janela', async () => {
    const key = uniqueKey();
    await rateLimit(key, 5, 30_000);
    vi.advanceTimersByTime(10_000);
    const retryAfter = rateLimitRetryAfter(key);
    expect(retryAfter).toBeGreaterThan(19_000);
    expect(retryAfter).toBeLessThanOrEqual(20_000);
  });

  it('nunca retorna valor negativo depois que a janela já expirou', async () => {
    const key = uniqueKey();
    await rateLimit(key, 5, 1000);
    vi.advanceTimersByTime(5000);
    expect(rateLimitRetryAfter(key)).toBe(0);
  });
});
