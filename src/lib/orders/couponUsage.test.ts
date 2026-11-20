import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Banco de mentira só com o que customerHasPaidOrder consulta: pedidos por
 * userId+status e perfis por id ou pelo CPF em claro (sem chave de PII).
 */
const db = vi.hoisted(() => ({
  users: {} as Record<string, { cpf?: string }>,
  paid: new Set<string>(),
}));
vi.mock('@/lib/firebase/admin', () => {
  const query = (name: string, filters: [string, unknown][] = []) => ({
    where: (field: string, _op: string, value: unknown) => query(name, [...filters, [field, value]]),
    limit: () => query(name, filters),
    get: async () => {
      if (name === 'orders') {
        const uid = filters.find(([f]) => f === 'userId')?.[1] as string;
        return { empty: !db.paid.has(uid) };
      }
      const cpf = filters.find(([f]) => f === 'cpf')?.[1];
      return { docs: Object.entries(db.users).filter(([, u]) => u.cpf === cpf).map(([id]) => ({ id })) };
    },
    doc: (id: string) => ({ get: async () => ({ data: () => db.users[id] }) }),
  });
  return { adminDb: { collection: (name: string) => query(name) } };
});

const { customerHasPaidOrder } = await import('./couponUsage');

describe('customerHasPaidOrder (cupom de primeira compra)', () => {
  beforeEach(() => {
    vi.stubEnv('PII_ENCRYPTION_KEY', '');
    db.users = {}; db.paid = new Set();
  });

  it('conta nova sem pedido e sem CPF: primeira compra', async () => {
    db.users = { nova: {} };
    expect(await customerHasPaidOrder('nova')).toBe(false);
  });

  it('pedido pago na própria conta', async () => {
    db.users = { antiga: { cpf: '52998224725' } };
    db.paid.add('antiga');
    expect(await customerHasPaidOrder('antiga')).toBe(true);
  });

  it('conta nova com o CPF de quem já comprou não é primeira compra', async () => {
    db.users = { antiga: { cpf: '52998224725' }, nova: { cpf: '529.982.247-25' } };
    db.paid.add('antiga');
    expect(await customerHasPaidOrder('nova')).toBe(true);
  });

  it('mesmo CPF sem nenhum pedido pago continua primeira compra', async () => {
    db.users = { antiga: { cpf: '52998224725' }, nova: { cpf: '52998224725' } };
    expect(await customerHasPaidOrder('nova')).toBe(false);
  });
});
