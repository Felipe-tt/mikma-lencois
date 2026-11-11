import { describe, expect, it } from 'vitest';
import { cobrancaAbacate, valorDaDevolucao } from './estorno';

const order = {
  items: [{ sku: 'a', quantity: 2, unitPrice: 10000 }, { sku: 'b', quantity: 1, unitPrice: 20000 }],
  // 400,00 em peças, 10% de desconto (360,00) + 21,90 de frete
  totalCents: 38190,
  delivery: { priceCents: 2190 },
};

describe('valorDaDevolucao', () => {
  it('pedido todo: o total pago, com frete', () => {
    expect(valorDaDevolucao(order, [{ sku: 'a', quantity: 2 }, { sku: 'b', quantity: 1 }])).toEqual({ cents: 38190, inteira: true });
  });
  it('parte: o valor das peças com o desconto distribuído, sem frete', () => {
    expect(valorDaDevolucao(order, [{ sku: 'b', quantity: 1 }])).toEqual({ cents: 18000, inteira: false });
    expect(valorDaDevolucao(order, [{ sku: 'a', quantity: 1 }])).toEqual({ cents: 9000, inteira: false });
  });
});

describe('cobrancaAbacate', () => {
  it('PIX e cartão no site são transparentes; cartão na página da AbacatePay é checkout', () => {
    expect(cobrancaAbacate({ method: 'pix', txId: 'pix_1', paidAt: 'x' })).toMatchObject({ ok: true, kind: 'transparent', chargeId: 'pix_1' });
    expect(cobrancaAbacate({ method: 'card', txId: 'card_1', paidAt: 'x' })).toMatchObject({ ok: true, kind: 'transparent', chargeId: 'card_1' });
    expect(cobrancaAbacate({ method: 'card', checkoutId: 'bill_1', paidAt: 'x' })).toMatchObject({ ok: true, kind: 'checkout', chargeId: 'bill_1' });
  });
  it('pago por fora ou sem pagamento: não dá', () => {
    expect(cobrancaAbacate({ method: 'pix', txId: 'p', paidAt: 'x', confirmedManuallyBy: 'u' }).ok).toBe(false);
    expect(cobrancaAbacate({ method: 'pix', txId: 'p' }).ok).toBe(false);
  });
});
