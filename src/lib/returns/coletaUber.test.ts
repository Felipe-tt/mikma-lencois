import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/push/notifySeller', () => ({ notifySeller: vi.fn() }));
vi.mock('./avisarCliente', () => ({ avisarCliente: vi.fn() }));

const { efeitoDaColeta } = await import('./coletaUber');
const agora = '2026-11-12T10:00:00.000Z';

describe('efeitoDaColeta', () => {
  it('entregador pegou o pacote: grava a coleta e avisa a loja', () => {
    expect(efeitoDaColeta('pickup_complete', {}, agora)).toMatchObject({ tipo: 'atualiza', campos: { coletadoEm: agora }, push: expect.any(String) });
  });
  it('chegou na loja: grava e manda o e-mail "chegou"', () => {
    expect(efeitoDaColeta('delivered', { coletadoEm: 'x' }, agora)).toMatchObject({ tipo: 'atualiza', campos: { entregueEm: agora }, aviso: 'chegou' });
  });
  it('repetido ou depois de entregue: nada', () => {
    expect(efeitoDaColeta('pickup', { status: 'pickup' }, agora)).toEqual({ tipo: 'nada' });
    expect(efeitoDaColeta('canceled', { entregueEm: 'x' }, agora)).toEqual({ tipo: 'nada' });
  });
  it('cancelada pela Uber: libera para chamar outro entregador', () => {
    expect(efeitoDaColeta('canceled', {}, agora).tipo).toBe('cancelada');
    expect(efeitoDaColeta('returned', { coletadoEm: 'x' }, agora).tipo).toBe('cancelada');
  });
});
