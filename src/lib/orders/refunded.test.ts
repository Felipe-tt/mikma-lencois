import { describe, expect, it } from 'vitest';
import { refundedCents } from './refunded';

describe('refundedCents', () => {
  it('estorno total devolve o pedido inteiro', () => {
    expect(refundedCents({ totalCents: 40000, payment: { refundStatus: 'done' } })).toBe(40000);
  });
  it('devoluções parciais somam, sem passar do total', () => {
    expect(refundedCents({ totalCents: 40000, payment: { partialRefundCents: 15000 } })).toBe(15000);
    expect(refundedCents({ totalCents: 40000, payment: { partialRefundCents: 99000 } })).toBe(40000);
  });
  it('sem estorno, zero', () => {
    expect(refundedCents({ totalCents: 40000, payment: {} })).toBe(0);
    expect(refundedCents({ totalCents: 40000 })).toBe(0);
  });
});
