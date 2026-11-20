import { describe, expect, it } from 'vitest';
import { withdrawalBlockReason } from './withdrawal';
import { customerCancelReason, customerTimeline } from './customerTimeline';

describe('desistir da compra pelo site', () => {
  it('vale para pedido pago que ainda não chegou', () => {
    for (const s of ['paid', 'preparing', 'shipped']) expect(withdrawalBlockReason(s)).toBeNull();
  });

  it('fora disso, diz o caminho certo', () => {
    expect(withdrawalBlockReason('delivered')).toMatch(/devolução/);
    expect(withdrawalBlockReason('pending_payment')).toMatch(/cancelar/);
    expect(withdrawalBlockReason('cancelled')).toMatch(/já foi cancelado/);
  });

  it('o cliente vê o próprio pedido e o cancelamento a pedido dele', () => {
    const timeline = [
      { status: 'paid', at: '2026-11-20T10:00:00Z' },
      { status: 'cancel_requested', at: '2026-11-20T11:00:00Z', note: 'Cliente pediu para desistir da compra' },
      { status: 'cancelled', at: '2026-11-20T12:00:00Z', note: 'Cancelado a pedido do cliente' },
    ];
    expect(customerTimeline(timeline).map(e => e.title)).toEqual(['Pagamento confirmado', 'Você pediu para desistir da compra', 'Pedido cancelado']);
    expect(customerCancelReason(timeline)).toBe('Cancelado a seu pedido');
  });
});
