import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;
const data: Record<string, Record<string, Doc>> = {};
const revalidated: string[] = [];

vi.mock('next/cache', () => ({ revalidateTag: (tag: string) => { revalidated.push(tag); } }));
vi.mock('@/lib/firebase/admin', () => {
  const query = (col: string, filters: [string, string, unknown][] = [], lim = Infinity) => ({
    where: (f: string, op: string, v: unknown) => query(col, [...filters, [f, op, v]], lim),
    limit: (n: number) => query(col, filters, n),
    get: async () => {
      const docs = Object.entries(data[col] ?? {})
        .filter(([, d]) => filters.every(([f, op, v]) => op === 'in' ? (v as unknown[]).includes(d[f]) : d[f] === v))
        .slice(0, lim)
        .map(([id, d]) => ({ id, ref: { col, id }, data: () => d }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  return {
    adminDb: {
      collection: (col: string) => query(col),
      batch: () => {
        const dels: { col: string; id: string }[] = [];
        return {
          delete: (ref: { col: string; id: string }) => { dels.push(ref); },
          commit: async () => { for (const r of dels) delete data[r.col][r.id]; },
        };
      },
    },
  };
});

const { deletionBlocker, deleteUserReviews } = await import('./accountDeletion');

beforeEach(() => {
  for (const k of Object.keys(data)) delete data[k];
  revalidated.length = 0;
});

describe('excluir conta', () => {
  it('libera sem pedido a caminho nem troca aberta', async () => {
    data.orders = { a: { userId: 'u1', status: 'delivered' }, b: { userId: 'u1', status: 'cancelled' }, c: { userId: 'u2', status: 'paid' } };
    data.returns = { r: { userId: 'u1', status: 'concluida', type: 'troca' }, s: { userId: 'u1', status: 'recusada', type: 'devolucao' } };
    expect(await deletionBlocker('u1')).toBeNull();
  });

  it('espera o pedido pago chegar', async () => {
    for (const status of ['paid', 'preparing', 'shipped']) {
      data.orders = { a: { userId: 'u1', status } };
      expect(await deletionBlocker('u1')).toMatch(/pedido a caminho/);
    }
  });

  it('espera a troca ou devolução terminar', async () => {
    data.returns = { r: { userId: 'u1', status: 'aprovada', type: 'troca' } };
    expect(await deletionBlocker('u1')).toMatch(/troca ou devolução em andamento/);
  });

  it('espera o dinheiro da devolução voltar', async () => {
    data.returns = { r: { userId: 'u1', status: 'concluida', type: 'devolucao' } };
    expect(await deletionBlocker('u1')).toMatch(/devolvermos o seu dinheiro/);
    data.returns.r.estorno = { status: 'falhou' };
    expect(await deletionBlocker('u1')).toMatch(/devolvermos o seu dinheiro/);
    data.returns.r.estorno = { status: 'feito' };
    expect(await deletionBlocker('u1')).toBeNull();
    // Troca por peça mais barata: a sobra também volta.
    data.returns = { t: { userId: 'u1', status: 'concluida', type: 'troca', saldoCents: -2000 } };
    expect(await deletionBlocker('u1')).toMatch(/devolvermos o seu dinheiro/);
  });

  it('apaga as avaliações da conta e atualiza a página dos produtos', async () => {
    data.reviews = {
      o1_p1: { userId: 'u1', productId: 'p1' },
      o2_p2: { userId: 'u1', productId: 'p2' },
      o3_p1: { userId: 'u2', productId: 'p1' },
    };
    expect(await deleteUserReviews('u1')).toBe(2);
    expect(Object.keys(data.reviews)).toEqual(['o3_p1']);
    expect(revalidated.sort()).toEqual(['avaliacoes-p1', 'avaliacoes-p2']);
  });
});
