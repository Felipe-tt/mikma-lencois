import { describe, it, expect } from 'vitest';
import { shippingBlockReason } from './shippingBlock';

describe('shippingBlockReason', () => {
  it('pedido segurado pelo detector não sai até liberar', () => {
    expect(shippingBlockReason({ payment: {}, risk: { hold: true } })).toMatch(/suspeito/);
    expect(shippingBlockReason({ payment: {}, risk: { hold: false, releasedBy: 'x' } })).toBeNull();
    expect(shippingBlockReason({ payment: {} })).toBeNull();
  });
  it('contestação aberta e estorno feito continuam bloqueando', () => {
    expect(shippingBlockReason({ payment: { dispute: { state: 'open' } } })).toMatch(/contestação/);
    expect(shippingBlockReason({ payment: { refundStatus: 'done' } })).toMatch(/estornado/);
  });
});
