import { describe, it, expect } from 'vitest';
import { normalizeRule, sitePriceCents } from './sitePrice';

describe('sitePriceCents', () => {
  it('sem acréscimo, o site cobra o preço da loja', () => {
    expect(sitePriceCents(9900, { pct: 0, rounding: '90' })).toBe(9900);
    expect(sitePriceCents(9900, undefined)).toBe(9900);
  });
  it('5% exato: 99,00 vira 103,95', () => {
    expect(sitePriceCents(9900, { pct: 5, rounding: 'exato' })).toBe(10395);
  });
  it('5% com final ,90: 99,00 vira 104,90', () => {
    expect(sitePriceCents(9900, { pct: 5, rounding: '90' })).toBe(10490);
  });
  it('final ,90 nunca fica abaixo do valor com acréscimo', () => {
    expect(sitePriceCents(10000, { pct: 0.9, rounding: '90' })).toBe(10090);
    expect(sitePriceCents(10000, { pct: 0.95, rounding: '90' })).toBe(10190);
  });
  it('limita o acréscimo entre 0 e 100% e ignora valor inválido', () => {
    expect(normalizeRule({ pct: 250 })).toEqual({ pct: 100, rounding: 'exato' });
    expect(normalizeRule({ pct: -3 })).toEqual({ pct: 0, rounding: 'exato' });
    expect(normalizeRule({ pct: Number.NaN })).toEqual({ pct: 0, rounding: 'exato' });
  });
});
