import { describe, it, expect } from 'vitest';
import { cardFeeFor, cardFeePct, normalizeFees, pixFeeInPriceCents, GATEWAY_FEE_DEFAULTS } from './gatewayFees';
import { computeCardTotalCents, interestFreeHint } from './orderPricing';
import { sitePriceCents, siteRuleFrom } from './sitePrice';

describe('taxas da AbacatePay', () => {
  it('sem nada salvo vale a tabela pública', () => {
    expect(normalizeFees(undefined)).toEqual(GATEWAY_FEE_DEFAULTS);
    expect(pixFeeInPriceCents({})).toBe(80);
  });

  it('desligado, o PIX não entra no preço e o cartão não cobra do cliente', () => {
    expect(pixFeeInPriceCents({ abacateFeePixInPrice: false })).toBe(0);
    expect(cardFeeFor({ abacateFeeCardToCustomer: false }, 1)).toEqual({ fixedCents: 0, rate: 0 });
  });

  it('percentual do cartão por faixa de parcelas', () => {
    const f = normalizeFees({});
    expect(cardFeePct(f, 1)).toBe(3.5);
    expect(cardFeePct(f, 2)).toBe(4);
    expect(cardFeePct(f, 6)).toBe(4);
    expect(cardFeePct(f, 7)).toBe(4.5);
    expect(cardFeePct(f, 12)).toBe(4.5);
  });

  it('valores estranhos do banco não quebram a conta', () => {
    const f = normalizeFees({ abacateFeePixCents: -5, abacateFeeCardPct1x: 'x', abacateFeeCardPct2a6: 99 });
    expect(f.abacateFeePixCents).toBe(80);
    expect(f.abacateFeeCardPct1x).toBe(3.5);
    expect(f.abacateFeeCardPct2a6).toBe(20);
  });
});

describe('cartão com a taxa por cima', () => {
  it('a loja recebe o valor cheio depois da taxa', () => {
    const base = 20000;
    const fee = cardFeeFor({}, 1);
    const total = computeCardTotalCents({ productsCents: base, couponDiscountCents: 0, shippingCents: 0, feeRate: 0, cardFee: fee });
    expect(total).toBe(20788); // (20000 + 60) / 0,965 = 20787,56, arredonda para cima
    const liquido = total - (total * fee.rate + fee.fixedCents);
    expect(liquido).toBeGreaterThanOrEqual(base);
    expect(liquido - base).toBeLessThan(1);
  });

  it('juros e taxa juntos: a taxa vale sobre o total com juros', () => {
    const fee = cardFeeFor({}, 4);
    const total = computeCardTotalCents({ productsCents: 30000, couponDiscountCents: 0, shippingCents: 0, feeRate: 0.0199, cardFee: fee });
    const comJuros = 30000 * 1.0199;
    expect(total - (total * fee.rate + fee.fixedCents)).toBeGreaterThanOrEqual(comJuros - 0.5);
  });

  it('a parcela "sem juros" do produto bate com o checkout', () => {
    const hint = interestFreeHint(30000, {});
    expect(hint.n).toBe(3);
    const checkout = computeCardTotalCents({ productsCents: 30000, couponDiscountCents: 0, shippingCents: 0, feeRate: 0, cardFee: cardFeeFor({}, 3) });
    expect(hint.perCents).toBe(Math.round(checkout / 3));
  });
});

describe('preço do site com a taxa do PIX', () => {
  it('soma a taxa depois do acréscimo e antes do ,90', () => {
    expect(sitePriceCents(10000, siteRuleFrom({ sitePriceMarkupPct: 5, sitePriceRounding: 'exato' }))).toBe(10580);
    expect(sitePriceCents(10000, siteRuleFrom({ sitePriceMarkupPct: 5, sitePriceRounding: '90' }))).toBe(10590);
    expect(sitePriceCents(10000, siteRuleFrom({ sitePriceMarkupPct: 0 }))).toBe(10080);
    expect(sitePriceCents(10000, siteRuleFrom({ sitePriceMarkupPct: 0, abacateFeePixInPrice: false }))).toBe(10000);
  });
});
