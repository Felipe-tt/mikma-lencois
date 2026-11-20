import { describe, expect, it, vi } from 'vitest';

const perfis: Record<string, Record<string, unknown>> = { u1: { name: 'Maria Souza' }, u2: { email: 'b@loja.com' } };
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      doc: (id: string) => ({
        get: async () => {
          if (id === 'falha') throw new Error('offline');
          return { data: () => perfis[id] };
        },
      }),
    }),
  },
}));

const { staffName } = await import('./staffName');

describe('staffName', () => {
  it('usa o nome do login', async () => {
    expect(await staffName({ uid: 'x', name: 'Ana Lima' })).toBe('Ana Lima');
  });

  it('sem nome no login, usa o do perfil', async () => {
    expect(await staffName({ uid: 'u1' })).toBe('Maria Souza');
  });

  it('nunca devolve e-mail', async () => {
    expect(await staffName({ uid: 'u2' })).toBe('Equipe');
    expect(await staffName({ uid: 'u2', name: 'b@loja.com' })).not.toContain('@');
  });

  it('falha ao ler o perfil não trava a ação', async () => {
    expect(await staffName({ uid: 'falha' })).toBe('Equipe');
  });
});
