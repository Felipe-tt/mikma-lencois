import { describe, it, expect } from 'vitest';
import { TROCA_FORA_DO_PRAZO, returnWindow } from './returnRequest';
import type { Order } from '@/types';

const order = (status: string, deliveredAt?: string) => ({ status, createdAt: '2026-10-01T12:00:00Z', delivery: { carrier: 'correios_pac', ...(deliveredAt ? { deliveredAt } : {}) } }) as unknown as Order;
const now = new Date('2026-11-11T12:00:00Z');

describe('returnWindow', () => {
  it('só depois de entregue', () => {
    expect(returnWindow(order('shipped'), now)).toEqual({ ok: false, reason: 'A troca é pedida depois que o pedido é entregue.' });
  });
  it('até 7 dias da entrega: troca, devolução e defeito', () => {
    const w = returnWindow(order('delivered', '2026-11-06T12:00:00Z'), now);
    expect(w).toMatchObject({ ok: true, troca: true, trocaAte: new Date('2026-11-13T12:00:00Z') });
  });
  it('no limite dos 7 dias ainda dá troca', () => {
    expect(returnWindow(order('delivered', '2026-11-04T12:00:00Z'), now)).toMatchObject({ ok: true, troca: true });
  });
  it('depois de 7 dias, só defeito, até 90', () => {
    expect(returnWindow(order('delivered', '2026-10-01T12:00:00Z'), now)).toMatchObject({ ok: true, troca: false, defeitoAte: new Date('2026-12-30T12:00:00Z') });
  });
  it('passados 90 dias, não dá mais por aqui', () => {
    const r = returnWindow(order('delivered', '2026-07-01T12:00:00Z'), now);
    expect(r.ok).toBe(false);
  });
  it('sem data de entrega, conta da compra', () => {
    expect(returnWindow(order('delivered'), now)).toMatchObject({ ok: true, troca: false });
  });
  it('a mensagem fora do prazo aponta para defeito', () => {
    expect(TROCA_FORA_DO_PRAZO).toMatch(/7 dias/);
    expect(TROCA_FORA_DO_PRAZO).toMatch(/Defeito/);
  });
});
