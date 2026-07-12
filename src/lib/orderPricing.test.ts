import { describe, it, expect } from 'vitest';
import {
  computeProductsCents,
  validateCoupon,
  computePixDiscountCents,
  computePixTotalCents,
  computeCardTotalCents,
  type CouponLike,
} from './orderPricing';

describe('computeProductsCents', () => {
  it('soma preço × quantidade de todos os itens', () => {
    expect(computeProductsCents([
      { unitPrice: 5000, quantity: 2 },
      { unitPrice: 3000, quantity: 1 },
    ])).toBe(13000);
  });

  it('retorna 0 pra carrinho vazio', () => {
    expect(computeProductsCents([])).toBe(0);
  });
});

describe('validateCoupon', () => {
  const base: CouponLike = { active: true, type: 'percent', value: 10 };

  it('calcula desconto percentual corretamente', () => {
    const r = validateCoupon(base, 10000);
    expect(r).toEqual({ valid: true, discountCents: 1000 });
  });

  it('calcula desconto fixo corretamente (ignora o subtotal)', () => {
    const r = validateCoupon({ ...base, type: 'fixed', value: 1500 }, 10000);
    expect(r).toEqual({ valid: true, discountCents: 1500 });
  });

  it('arredonda o desconto percentual pro centavo mais próximo', () => {
    // 10% de 9999 = 999.9 -> arredonda pra 1000
    const r = validateCoupon(base, 9999);
    expect(r.discountCents).toBe(1000);
  });

  it('rejeita cupom inativo', () => {
    const r = validateCoupon({ ...base, active: false }, 10000);
    expect(r.valid).toBe(false);
    expect(r.discountCents).toBe(0);
    expect(r.reason).toMatch(/inativo/i);
  });

  it('rejeita cupom expirado', () => {
    const r = validateCoupon({ ...base, expiresAt: '2020-01-01T00:00:00Z' }, 10000, new Date('2026-01-01'));
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/expirado/i);
  });

  it('aceita cupom no limite exato de expiração como já expirado (>= agora)', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const r = validateCoupon({ ...base, expiresAt: now.toISOString() }, 10000, now);
    expect(r.valid).toBe(false);
  });

  it('aceita cupom que ainda não expirou', () => {
    const r = validateCoupon({ ...base, expiresAt: '2099-01-01T00:00:00Z' }, 10000, new Date('2026-01-01'));
    expect(r.valid).toBe(true);
  });

  it('rejeita cupom esgotado (usedCount >= maxUses)', () => {
    const r = validateCoupon({ ...base, maxUses: 5, usedCount: 5 }, 10000);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/esgotado/i);
  });

  it('aceita cupom ainda dentro do limite de usos', () => {
    const r = validateCoupon({ ...base, maxUses: 5, usedCount: 4 }, 10000);
    expect(r.valid).toBe(true);
  });

  it('rejeita quando o pedido não bate o mínimo exigido', () => {
    const r = validateCoupon({ ...base, minOrderCents: 20000 }, 10000);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/mínimo/i);
    expect(r.reason).toContain('200.00');
  });

  it('aceita quando o pedido bate exatamente o mínimo exigido', () => {
    const r = validateCoupon({ ...base, minOrderCents: 10000 }, 10000);
    expect(r.valid).toBe(true);
  });

  it('não deixa usedCount ausente quebrar a checagem de maxUses', () => {
    const r = validateCoupon({ ...base, maxUses: 1 }, 10000); // usedCount undefined
    expect(r.valid).toBe(true);
  });
});

describe('computePixDiscountCents', () => {
  const settings = { pixDiscountThresholdCents: 20000, pixDiscountPct: 5 };

  it('não dá desconto abaixo do piso', () => {
    expect(computePixDiscountCents(19999, settings)).toBe(0);
  });

  it('dá desconto a partir do piso (inclusive)', () => {
    expect(computePixDiscountCents(20000, settings)).toBe(1000); // 5% de 200
  });

  it('dá desconto acima do piso', () => {
    expect(computePixDiscountCents(30000, settings)).toBe(1500);
  });

  it('desconto desligado (threshold <= 0) nunca desconta, mesmo em pedido caro', () => {
    expect(computePixDiscountCents(1_000_000, { pixDiscountThresholdCents: 0, pixDiscountPct: 5 })).toBe(0);
  });
});

describe('computePixTotalCents', () => {
  it('soma frete e subtrai os descontos', () => {
    const total = computePixTotalCents({
      productsCents: 10000, pixDiscountCents: 500, couponDiscountCents: 1000, shippingCents: 2000,
    });
    expect(total).toBe(10500); // 10000 - 500 - 1000 + 2000
  });

  it('nunca fica negativo, mesmo com desconto maior que o subtotal', () => {
    const total = computePixTotalCents({
      productsCents: 1000, pixDiscountCents: 500, couponDiscountCents: 2000, shippingCents: 0,
    });
    expect(total).toBe(0);
  });

  it('funciona sem nenhum desconto (só produtos + frete)', () => {
    const total = computePixTotalCents({
      productsCents: 10000, pixDiscountCents: 0, couponDiscountCents: 0, shippingCents: 1500,
    });
    expect(total).toBe(11500);
  });
});

describe('computeCardTotalCents', () => {
  it('aplica a taxa da adquirente por cima do (produtos - cupom + frete)', () => {
    // (10000 - 0 + 2000) * 1.0399 = 12478.8 -> arredonda 12479
    const total = computeCardTotalCents({
      productsCents: 10000, couponDiscountCents: 0, shippingCents: 2000, feeRate: 0.0399,
    });
    expect(total).toBe(12479);
  });

  it('taxa zero não altera o valor', () => {
    const total = computeCardTotalCents({
      productsCents: 10000, couponDiscountCents: 1000, shippingCents: 500, feeRate: 0,
    });
    expect(total).toBe(9500);
  });

  it('nunca fica negativo', () => {
    const total = computeCardTotalCents({
      productsCents: 1000, couponDiscountCents: 5000, shippingCents: 0, feeRate: 0.05,
    });
    expect(total).toBe(0);
  });
});
