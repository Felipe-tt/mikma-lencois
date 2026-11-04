import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));

const { ledgerFromOrders } = await import('./shipping-ledger');

describe('ledgerFromOrders', () => {
  it('sem pedidos o caixa fica zerado', () => {
    expect(ledgerFromOrders([])).toEqual({ collectedCents: 0, spentCents: 0 });
  });

  it('conta o frete de pedido pago e não o de pendente, expirado ou cancelado', () => {
    const r = ledgerFromOrders([
      { status: 'paid', shippingCents: 1000 },
      { status: 'delivered', shippingCents: 500 },
      { status: 'pending_payment', shippingCents: 700 },
      { status: 'payment_expired', shippingCents: 700 },
      { status: 'cancelled', shippingCents: 700 },
    ]);
    expect(r.collectedCents).toBe(1500);
  });

  it('pedido de teste não entra', () => {
    const r = ledgerFromOrders([
      { status: 'paid', shippingCents: 1000, payment: { abacateSandbox: true } },
      { status: 'shipped', delivery: { carrier: 'uber_direct', shippingCostCents: 900, uberSandbox: true } },
    ]);
    expect(r).toEqual({ collectedCents: 0, spentCents: 0 });
  });

  it('custo gravado no despacho conta mesmo se o pedido foi cancelado depois', () => {
    const r = ledgerFromOrders([{ status: 'cancelled', delivery: { carrier: 'uber_direct', shippingCostCents: 1200 } }]);
    expect(r.spentCents).toBe(1200);
  });

  it('pedido antigo enviado pelos Correios usa o valor cotado como custo', () => {
    const r = ledgerFromOrders([
      { status: 'shipped', delivery: { carrier: 'correios_pac', realPriceCents: 2500 } },
      { status: 'paid', delivery: { carrier: 'correios_pac', realPriceCents: 2500 } },
    ]);
    expect(r.spentCents).toBe(2500);
  });
});
