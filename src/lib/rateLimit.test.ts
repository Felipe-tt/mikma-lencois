import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  it('permite até o limite de requisições dentro da janela', () => {
    const key = uniqueKey();
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
  });

  it('bloqueia a partir da requisição que excede o limite', () => {
    const key = uniqueKey();
    rateLimit(key, 2, 60_000);
    rateLimit(key, 2, 60_000);
    expect(rateLimit(key, 2, 60_000)).toBe(false);
  });

  it('reseta a contagem depois que a janela expira', () => {
    const key = uniqueKey();
    rateLimit(key, 1, 60_000);
    expect(rateLimit(key, 1, 60_000)).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(rateLimit(key, 1, 60_000)).toBe(true);
  });

  it('mantém keys diferentes isoladas entre si', () => {
    const keyA = uniqueKey();
    const keyB = uniqueKey();
    rateLimit(keyA, 1, 60_000);
    expect(rateLimit(keyA, 1, 60_000)).toBe(false);
    // key diferente não deveria ser afetada pelo limite de keyA
    expect(rateLimit(keyB, 1, 60_000)).toBe(true);
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

  it('retorna o tempo restante até o reset da janela', () => {
    const key = uniqueKey();
    rateLimit(key, 5, 30_000);
    vi.advanceTimersByTime(10_000);
    const retryAfter = rateLimitRetryAfter(key);
    expect(retryAfter).toBeGreaterThan(19_000);
    expect(retryAfter).toBeLessThanOrEqual(20_000);
  });

  it('nunca retorna valor negativo depois que a janela já expirou', () => {
    const key = uniqueKey();
    rateLimit(key, 5, 1000);
    vi.advanceTimersByTime(5000);
    expect(rateLimitRetryAfter(key)).toBe(0);
  });
});
