import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Caminho do Upstash, com um Redis falso que guarda contagem e prazo.
 * O que importa: a soma e o prazo vão juntos, na mesma transação, e uma
 * chave que ficou sem prazo (o bug antigo) volta a ter.
 */
const store = new Map<string, { value: number; ttl: number | null }>();
const calls: string[][] = [];

vi.mock('@upstash/redis', () => ({
  Redis: class {
    multi() {
      const queued: Array<() => number> = [];
      const tx = {
        incr(key: string) {
          queued.push(() => {
            calls.push(['incr', key]);
            const cur = store.get(key) ?? { value: 0, ttl: null };
            cur.value += 1;
            store.set(key, cur);
            return cur.value;
          });
          return tx;
        },
        expire(key: string, seconds: number, option?: string) {
          queued.push(() => {
            calls.push(['expire', key, String(seconds), option ?? '']);
            const cur = store.get(key);
            if (!cur || (option === 'NX' && cur.ttl !== null)) return 0;
            cur.ttl = seconds;
            return 1;
          });
          return tx;
        },
        async exec() { return queued.map(run => run()); },
      };
      return tx;
    }
  },
}));

let rateLimit: typeof import('./rateLimit').rateLimit;

beforeAll(async () => {
  vi.stubEnv('UPSTASH_REDIS_CREDS', JSON.stringify({ url: 'https://exemplo.upstash.io', token: 't' }));
  ({ rateLimit } = await import('./rateLimit'));
});

describe('rateLimit no Upstash', () => {
  it('soma e põe o prazo na mesma transação, só se a chave não tiver prazo', async () => {
    calls.length = 0;
    expect(await rateLimit('a', 2, 60_000)).toBe(true);
    expect(calls).toEqual([['incr', 'ratelimit:a'], ['expire', 'ratelimit:a', '60', 'NX']]);
    expect(store.get('ratelimit:a')).toEqual({ value: 1, ttl: 60 });
  });

  it('bloqueia depois do limite', async () => {
    expect(await rateLimit('b', 2, 60_000)).toBe(true);
    expect(await rateLimit('b', 2, 60_000)).toBe(true);
    expect(await rateLimit('b', 2, 60_000)).toBe(false);
  });

  it('chave que ficou sem prazo (bug antigo) volta a ter, e o prazo não é renovado a cada chamada', async () => {
    store.set('ratelimit:presa', { value: 500, ttl: null });
    expect(await rateLimit('presa', 40, 3_600_000)).toBe(false);
    expect(store.get('ratelimit:presa')?.ttl).toBe(3600);
    store.get('ratelimit:presa')!.ttl = 10; // faltando 10 s
    await rateLimit('presa', 40, 3_600_000);
    expect(store.get('ratelimit:presa')?.ttl).toBe(10);
  });
});
