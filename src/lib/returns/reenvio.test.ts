import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/shipping-pricing', () => ({ computeShippingOptions: vi.fn() }));

const { saldoDaTroca } = await import('./reenvio');

describe('saldoDaTroca', () => {
  it('mesmo preço: o cliente paga só o frete do novo envio', () => {
    expect(saldoDaTroca(39990, 39990, 2190)).toBe(2190);
  });
  it('peça mais cara: diferença mais frete', () => {
    expect(saldoDaTroca(29990, 39990, 2190)).toBe(12190);
  });
  it('peça mais barata: a diferença abate o frete e o resto volta', () => {
    expect(saldoDaTroca(39990, 29990, 2190)).toBe(-7810);
  });
  it('defeito (frete por conta da loja): nada a pagar', () => {
    expect(saldoDaTroca(39990, 39990, 0)).toBe(0);
  });
});
