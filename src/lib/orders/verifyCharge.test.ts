import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ checkPixStatus: vi.fn(), getCheckoutStatus: vi.fn(), getTransparent: vi.fn() }));
vi.mock('@/lib/abacatepayApi', () => api);
import { verifyChargePaid } from './verifyCharge';

const ok = (data: object) => ({ ok: true, data });
beforeEach(() => { Object.values(api).forEach(f => f.mockReset()); });

describe('verifyChargePaid', () => {
  it('PIX pago confirma, com a chave do ambiente do pedido', async () => {
    api.checkPixStatus.mockResolvedValue(ok({ status: 'PAID' }));
    expect(await verifyChargePaid('pix_char_1', 'ord_1', true)).toEqual({ kind: 'paid' });
    expect(api.checkPixStatus).toHaveBeenCalledWith('pix_char_1', true);
  });
  it('ainda pendente pede reenvio', async () => {
    api.getTransparent.mockResolvedValue(ok({ status: 'PENDING' }));
    expect(await verifyChargePaid('card_1', 'ord_1', false)).toEqual({ kind: 'pending' });
  });
  it('recusa cobrança de outro pedido, vencida ou de outro ambiente', async () => {
    api.getCheckoutStatus.mockResolvedValue(ok({ status: 'PAID', externalId: 'ord_2' }));
    expect((await verifyChargePaid('bill_1', 'ord_1', false)).kind).toBe('rejected');
    api.getTransparent.mockResolvedValue(ok({ status: 'APPROVED', metadata: { orderId: 'ord_2' } }));
    expect((await verifyChargePaid('card_1', 'ord_1', false)).kind).toBe('rejected');
    api.getTransparent.mockResolvedValue(ok({ status: 'APPROVED', metadata: { orderId: 'ord_1' } }));
    expect((await verifyChargePaid('card_1', 'ord_1', false)).kind).toBe('paid');
    api.checkPixStatus.mockResolvedValue(ok({ status: 'EXPIRED' }));
    expect((await verifyChargePaid('pix_char_1', 'ord_1', false)).kind).toBe('rejected');
    // Não encontrada no ambiente do pedido: nunca confirma (fica para reenvio).
    api.checkPixStatus.mockResolvedValue({ ok: false, status: 404, error: 'not found' });
    expect((await verifyChargePaid('pix_char_1', 'ord_1', false)).kind).toBe('pending');
  });
  it('consulta fora do ar ou sem permissão não trava: decide pelo aviso', async () => {
    api.checkPixStatus.mockResolvedValue({ ok: false, status: 0, error: 'timeout' });
    expect(await verifyChargePaid('pix_char_1', 'ord_1', false)).toEqual({ kind: 'unknown' });
    api.checkPixStatus.mockResolvedValue({ ok: false, status: 401, error: 'Insufficient permissions' });
    expect(await verifyChargePaid('pix_char_1', 'ord_1', false)).toEqual({ kind: 'unknown' });
  });
});
