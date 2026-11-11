import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn() }));

const { avisoDoStatus } = await import('./avisarCliente');

describe('avisoDoStatus', () => {
  it('cada status pede o seu e-mail', () => {
    expect(avisoDoStatus({ status: 'aprovada' })).toBe('aprovada');
    expect(avisoDoStatus({ status: 'recusada' })).toBe('recusada');
    expect(avisoDoStatus({ status: 'concluida' })).toBe('concluida');
    expect(avisoDoStatus({ status: 'solicitada' })).toBeNull();
  });
  it('entregue no balcão: avisa que chegou', () => {
    expect(avisoDoStatus({ status: 'aprovada', recebidaEm: '2026-11-12T15:00:00Z' })).toBe('chegou');
  });
});
