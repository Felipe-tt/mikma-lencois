import { describe, it, expect } from 'vitest';
import { returnWindow } from './returnRequest';
import type { Order } from '@/types';

const order = (status: string, deliveredAt?: string) => ({ status, createdAt: '2026-10-01T12:00:00Z', delivery: { carrier: 'correios_pac', ...(deliveredAt ? { deliveredAt } : {}) } }) as unknown as Order;
const now = new Date('2026-11-11T12:00:00Z');

describe('returnWindow', () => {
  it('só depois de entregue', () => {
    expect(returnWindow(order('shipped'), now)).toEqual({ ok: false, reason: 'A troca é pedida depois que o pedido é entregue.' });
  });
  it('até 7 dias da entrega ainda é arrependimento', () => {
    expect(returnWindow(order('delivered', '2026-11-06T12:00:00Z'), now)).toEqual({ ok: true, arrependimento: true });
  });
  it('depois de 7 dias, troca por defeito até 90 dias', () => {
    expect(returnWindow(order('delivered', '2026-10-01T12:00:00Z'), now)).toEqual({ ok: true, arrependimento: false });
  });
  it('passados 90 dias, não dá mais por aqui', () => {
    const r = returnWindow(order('delivered', '2026-07-01T12:00:00Z'), now);
    expect(r.ok).toBe(false);
  });
  it('sem data de entrega, conta da compra', () => {
    expect(returnWindow(order('delivered'), now)).toEqual({ ok: true, arrependimento: false });
  });
});
