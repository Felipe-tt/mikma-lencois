import { describe, expect, it, vi } from 'vitest';

// FieldValue.delete() vira um marcador simples que o banco falso entende.
const DELETE = Symbol('delete');
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => DELETE } }));

const { runRetention, orderCutoffIso, cutoffIso } = await import('./retention');

type Doc = Record<string, unknown>;

/** Firestore mínimo em memória: where/orderBy/limit/get, update/set/delete. */
function fakeDb(data: Record<string, Record<string, Doc>>) {
  const ref = (col: string, id: string) => ({
    id,
    get: async () => ({ exists: !!data[col]?.[id], data: () => data[col]?.[id] }),
    set: async (v: Doc, opt?: { merge?: boolean }) => { data[col] ??= {}; data[col][id] = opt?.merge ? { ...data[col][id], ...v } : v; },
    update: async (v: Doc) => {
      const cur = { ...data[col][id] };
      for (const [k, val] of Object.entries(v)) { if (val === DELETE) delete cur[k]; else cur[k] = val; }
      data[col][id] = cur;
    },
    delete: async () => { delete data[col]?.[id]; },
  });
  const query = (col: string, filters: [string, string, unknown][] = [], order?: string, lim = Infinity) => ({
    where: (f: string, op: string, v: unknown) => query(col, [...filters, [f, op, v]], order, lim),
    orderBy: (f: string) => query(col, filters, f, lim),
    limit: (n: number) => query(col, filters, order, n),
    get: async () => {
      let rows = Object.entries(data[col] ?? {}).filter(([, d]) => filters.every(([f, op, v]) => {
        const x = d[f] as string;
        if (x === undefined) return false;
        return op === '<' ? x < (v as string) : op === '>=' ? x >= (v as string) : op === '==' ? x === v : false;
      }));
      if (order) rows = rows.sort(([, a], [, b]) => String(a[order]).localeCompare(String(b[order])));
      const docs = rows.slice(0, lim).map(([id, d]) => ({ id, ref: ref(col, id), get: (k: string) => d[k], data: () => d }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  return { collection: (col: string) => ({ ...query(col), doc: (id: string) => ref(col, id) }) };
}

function fakeAuth(users: { uid: string; email?: string; providerData: unknown[]; metadata: { creationTime: string; lastSignInTime?: string } }[]) {
  const deleted: string[] = [];
  return {
    deleted,
    listUsers: async () => ({ users, pageToken: undefined }),
    deleteUser: async (uid: string) => { deleted.push(uid); },
  };
}

const NOW = new Date('2026-11-03T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('retenção (LGPD)', () => {
  it('limites de data', () => {
    expect(orderCutoffIso(NOW)).toBe('2021-11-03T12:00:00.000Z');
    expect(cutoffIso(NOW, 365)).toBe(daysAgo(365));
  });

  it('anonimiza pedido com mais de 5 anos, tira o IP com mais de 1 ano e mantém os recentes', async () => {
    const address = { cep: '89000000', street: 'Rua A', number: '1', neighborhood: 'Centro', city: 'Blumenau', state: 'SC' };
    const data: Record<string, Record<string, Doc>> = {
      orders: {
        antigo: { createdAt: daysAgo(6 * 365), customerName: 'Ana', customerEmail: 'a@x.com', clientIp: '1.1.1.1', address, addressKey: 'k', totalCents: 1000, userId: 'u1' },
        medio: { createdAt: daysAgo(400), customerName: 'Bia', clientIp: '2.2.2.2', address, userId: 'u2' },
        novo: { createdAt: daysAgo(10), customerName: 'Cris', clientIp: '3.3.3.3', address, userId: 'u3' },
      },
    };
    const db = fakeDb(data);
    const r = await runRetention(db as never, fakeAuth([]) as never, NOW);

    expect(r.ordersAnonymized).toBe(1);
    expect(data.orders.antigo).toMatchObject({ totalCents: 1000, address: { city: 'Blumenau', state: 'SC', street: '' } });
    expect(data.orders.antigo).not.toHaveProperty('customerName');
    expect(data.orders.antigo).not.toHaveProperty('customerEmail');
    expect(data.orders.antigo).not.toHaveProperty('clientIp');

    expect(data.orders.medio).toMatchObject({ customerName: 'Bia', address });
    expect(data.orders.medio).not.toHaveProperty('clientIp');

    expect(data.orders.novo).toMatchObject({ customerName: 'Cris', clientIp: '3.3.3.3' });

    // Segunda rodada: o cursor evita reprocessar o que já foi limpo.
    const again = await runRetention(db as never, fakeAuth([]) as never, NOW);
    expect(again.ordersAnonymized).toBe(0);
    expect(again.orderIpsRemoved).toBe(0);
  });

  it('apaga convidado parado e sem pedido; mantém quem comprou ou tem conta', async () => {
    const data: Record<string, Record<string, Doc>> = {
      orders: { o1: { createdAt: daysAgo(200), userId: 'guest-comprou' } },
      users: { 'guest-parado': {}, 'guest-comprou': {} },
      carts: { 'guest-parado': {} },
    };
    const auth = fakeAuth([
      { uid: 'guest-parado', providerData: [], metadata: { creationTime: daysAgo(200), lastSignInTime: daysAgo(120) } },
      { uid: 'guest-comprou', providerData: [], metadata: { creationTime: daysAgo(200), lastSignInTime: daysAgo(120) } },
      { uid: 'guest-recente', providerData: [], metadata: { creationTime: daysAgo(20), lastSignInTime: daysAgo(5) } },
      { uid: 'cliente', email: 'c@x.com', providerData: [{}], metadata: { creationTime: daysAgo(900), lastSignInTime: daysAgo(800) } },
    ]);
    const r = await runRetention(fakeDb(data) as never, auth as never, NOW);
    expect(r.guestsDeleted).toBe(1);
    expect(auth.deleted).toEqual(['guest-parado']);
    expect(data.users).not.toHaveProperty('guest-parado');
    expect(data.carts).not.toHaveProperty('guest-parado');
    expect(data.users).toHaveProperty('guest-comprou');
  });

  it('apaga "avise-me" com mais de 1 ano e fila de manutenção com mais de 30 dias', async () => {
    const data: Record<string, Record<string, Doc>> = {
      restockRequests: { velho: { createdAt: daysAgo(400), email: 'a@x.com' }, novo: { createdAt: daysAgo(30), email: 'b@x.com' } },
      maintenance_queue: { velho: { lastSeenAt: daysAgo(40) }, novo: { lastSeenAt: daysAgo(1) } },
    };
    const r = await runRetention(fakeDb(data) as never, fakeAuth([]) as never, NOW);
    expect(r.restockDeleted).toBe(1);
    expect(r.queueDeleted).toBe(1);
    expect(Object.keys(data.restockRequests)).toEqual(['novo']);
    expect(Object.keys(data.maintenance_queue)).toEqual(['novo']);
  });
});
