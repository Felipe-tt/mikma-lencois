import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/uber-direct', () => ({}));

import { assignRelativeTags, type ShippingOption } from './shipping-pricing';

const opt = (carrier: string, priceCents: number, estimatedDays: number, tag?: ShippingOption['tag']): ShippingOption =>
  ({ carrier, label: carrier, priceCents, realPriceCents: priceCents, estimatedDays, available: true, tag } as ShippingOption);

describe('assignRelativeTags', () => {
  it('marca só a mais barata como econômica e a mais rápida como rápida', () => {
    const out = assignRelativeTags([
      opt('pickup', 0, 0, 'local'),
      opt('correios_pac', 2500, 10, 'economico'),
      opt('correios_sedex', 4500, 3, 'rapido'),
      opt('jadlog_package', 3200, 5, 'economico'),
    ]);
    expect(out.map(o => o.tag)).toEqual(['local', 'economico', 'rapido', undefined]);
  });

  it('com uma transportadora só, ela fica sem tag', () => {
    const out = assignRelativeTags([opt('pickup', 0, 0, 'local'), opt('jadlog_package', 3200, 5, 'economico')]);
    expect(out.map(o => o.tag)).toEqual(['local', undefined]);
  });

  it('quando a mais barata também é a mais rápida, fica só econômica', () => {
    const out = assignRelativeTags([opt('a', 2000, 2), opt('b', 3000, 4)]);
    expect(out.map(o => o.tag)).toEqual(['economico', undefined]);
  });

  it('com frete grátis usa o preço real pra decidir', () => {
    const a = { ...opt('a', 0, 10), realPriceCents: 2500 };
    const b = { ...opt('b', 0, 3), realPriceCents: 4500 };
    expect(assignRelativeTags([b, a]).map(o => o.tag)).toEqual(['rapido', 'economico']);
  });
});
