import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const { withPublicOffer } = await import('./settings');
const { STORE_DEFAULTS } = await import('./store-settings');

describe('withPublicOffer', () => {
  const base = { ...STORE_DEFAULTS, freeShippingThresholdCents: 19900, freeShippingMaxLossCents: 50000, topbarText: 'Frete grátis acima de R$ 199' };

  it('com o caixa dentro do teto, o site anuncia o frete grátis normalmente', () => {
    expect(withPublicOffer(base, -1000)).toBe(base);
  });

  it('com o frete grátis suspenso, a oferta some do site', () => {
    const s = withPublicOffer(base, -60000);
    expect(s.freeShippingThresholdCents).toBe(0);
    expect(s.topbarText).toBe('');
  });

  it('a faixa de aviso que não fala de frete grátis continua', () => {
    expect(withPublicOffer({ ...base, topbarText: 'Entrega em 1h em Blumenau' }, -60000).topbarText).toBe('Entrega em 1h em Blumenau');
  });

  it('sem frete grátis configurado, nada muda', () => {
    const semFrete = { ...base, freeShippingThresholdCents: 0, topbarText: 'Retirada grátis na loja' };
    expect(withPublicOffer(semFrete, -60000)).toBe(semFrete);
  });
});
