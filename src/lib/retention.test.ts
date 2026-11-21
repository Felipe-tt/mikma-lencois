import { describe, expect, it, vi } from 'vitest';

// FieldValue.delete() vira um marcador simples que o banco falso entende.
const DELETE = Symbol('delete');
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => DELETE } }));

const { runRetention, orderCutoffIso, cutoffIso, nfeCutoffIso } = await import('./retention');

type Doc = Record<string, unknown>;
type Ref = { id: string; delete: () => Promise<void> };
interface FakeQuery {
  where: (f: string, op: string, v: unknown) => FakeQuery;
  orderBy: (f: string) => FakeQuery;
  limit: (n: number) => FakeQuery;
  get: () => Promise<{ docs: { id: string; ref: Ref; get: (k: string) => unknown; data: () => Doc }[]; size: number; empty: boolean }>;
}

/**
 * Firestore mínimo em memória: where/orderBy/limit/get, update/set/delete,
 * subcoleções (chave "orders/o1/nfeDocs"), grupo de coleção e lote.
 */
function fakeDb(data: Record<string, Record<string, Doc>>) {
  const sub = (path: string) => ({ ...query(path), doc: (id: string) => ref(path, id) });
  const ref = (col: string, id: string): Ref & Record<string, unknown> => ({
    id,
    collection: (name: string) => sub(`${col}/${id}/${name}`),
    get: async () => ({ exists: !!data[col]?.[id], data: () => data[col]?.[id] }),
    set: async (v: Doc, opt?: { merge?: boolean }) => {
      data[col] ??= {};
      const cur: Doc = opt?.merge ? { ...data[col][id] } : {};
      for (const [k, val] of Object.entries(v)) { if (val === DELETE) delete cur[k]; else cur[k] = val; }
      data[col][id] = cur;
    },
    update: async (v: Doc) => {
      const cur = { ...data[col][id] };
      for (const [k, val] of Object.entries(v)) { if (val === DELETE) delete cur[k]; else cur[k] = val; }
      data[col][id] = cur;
    },
    delete: async () => { delete data[col]?.[id]; },
  });
  const query = (col: string, filters: [string, string, unknown][] = [], order?: string, lim = Infinity, group = false): FakeQuery => ({
    where: (f: string, op: string, v: unknown) => query(col, [...filters, [f, op, v]], order, lim, group),
    orderBy: (f: string) => query(col, filters, f, lim, group),
    limit: (n: number) => query(col, filters, order, n, group),
    get: async () => {
      const paths = group ? Object.keys(data).filter(k => k === col || k.endsWith(`/${col}`)) : [col];
      const all = paths.flatMap(path => Object.entries(data[path] ?? {}).map(([id, d]) => [path, id, d] as const));
      let rows = all.filter(([, , d]) => filters.every(([f, op, v]) => {
        const x = f.split('.').reduce<unknown>((o, k) => (o as Doc | undefined)?.[k], d) as string;
        if (x === undefined) return false;
        return op === '<' ? x < (v as string) : op === '>=' ? x >= (v as string) : op === '==' ? x === v : op === 'in' ? (v as unknown[]).includes(x) : false;
      }));
      if (order) rows = rows.filter(([, , d]) => d[order] !== undefined).sort(([, , a], [, , b]) => String(a[order]).localeCompare(String(b[order])));
      const docs = rows.slice(0, lim).map(([path, id, d]) => ({ id, ref: ref(path, id), get: (k: string) => d[k], data: () => d }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  return {
    collection: sub,
    collectionGroup: (name: string) => query(name, [], undefined, Infinity, true),
    batch: () => {
      const dels: Ref[] = [];
      return { delete: (r: Ref) => { dels.push(r); }, commit: async () => { for (const r of dels) await r.delete(); } };
    },
  };
}

/** Storage falso: guarda o que foi apagado. */
function fakeFiles() {
  const prefixes: string[] = [];
  const paths: string[] = [];
  const privatized: string[] = [];
  return {
    prefixes, paths, privatized,
    deletePrefix: async (p: string) => { prefixes.push(p); },
    deletePath: async (p: string) => { paths.push(p); },
    privatizePrefix: async (p: string) => { privatized.push(p); return 2; },
  };
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

  it('criptografa CPF e telefone que ainda estão em claro', async () => {
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    try {
      const data: Record<string, Record<string, Doc>> = {
        users: { antigo: { name: 'Ana', cpf: '52998224725', phone: '47999990000' }, novo: { name: 'Bia' } },
      };
      const r = await runRetention(fakeDb(data) as never, fakeAuth([]) as never, NOW);
      expect(r.piiEncrypted).toBe(2);
      expect(data.users.antigo).not.toHaveProperty('cpf');
      expect(data.users.antigo).not.toHaveProperty('phone');
      expect(String(data.users.antigo.cpfEnc)).toMatch(/^enc1:/);
      expect(String(data.users.antigo.phoneEnc)).toMatch(/^enc1:/);
      expect(data.users.novo).toEqual({ name: 'Bia' });
    } finally {
      delete process.env.PII_ENCRYPTION_KEY;
    }
  });

  it('apaga "avise-me" e registro de acesso a CPF com mais de 1 ano, e fila de manutenção com mais de 30 dias', async () => {
    const data: Record<string, Record<string, Doc>> = {
      restockRequests: { velho: { createdAt: daysAgo(400), email: 'a@x.com' }, novo: { createdAt: daysAgo(30), email: 'b@x.com' } },
      maintenance_queue: { velho: { lastSeenAt: daysAgo(40) }, novo: { lastSeenAt: daysAgo(1) } },
      piiAccessLog: { velho: { at: daysAgo(400), by: 's1', customer: 'c1' }, novo: { at: daysAgo(10), by: 's1', customer: 'c2' } },
    };
    const r = await runRetention(fakeDb(data) as never, fakeAuth([]) as never, NOW);
    expect(r.restockDeleted).toBe(1);
    expect(r.queueDeleted).toBe(1);
    expect(r.piiLogDeleted).toBe(1);
    expect(Object.keys(data.piiAccessLog)).toEqual(['novo']);
    expect(Object.keys(data.restockRequests)).toEqual(['novo']);
    expect(Object.keys(data.maintenance_queue)).toEqual(['novo']);
  });

  it('tira a avaliação do detector de golpe do pedido (o cliente lê o pedido)', async () => {
    const risk = { score: 70, level: 'alto', hold: true, signals: [{ reason: 'Mesmo CPF em 3 contas', relatedOrderIds: ['ord_outro'], points: 40 }], assessedAt: daysAgo(1) };
    const data: Record<string, Record<string, Doc>> = {
      orders: {
        velho: { createdAt: daysAgo(10), userId: 'u1', risk },
        novo: { createdAt: daysAgo(1), userId: 'u2', risk: { hold: false } },
      },
    };
    const r = await runRetention(fakeDb(data) as never, fakeAuth([]) as never, NOW);
    expect(r.riskMoved).toBe(1);
    expect(data.orders.velho.risk).toEqual({ hold: true });
    expect(data.orderRisk.velho).toMatchObject({ level: 'alto', signals: risk.signals });
    expect(data.orders.novo.risk).toEqual({ hold: false });
  });

  it('a avaliação de golpe sai junto com os dados pessoais do pedido', async () => {
    const data: Record<string, Record<string, Doc>> = {
      orders: {
        antigo: { createdAt: daysAgo(6 * 365), customerName: 'Ana', userId: 'u1', risk: { hold: false } },
        novo: { createdAt: daysAgo(10), customerName: 'Bia', userId: 'u2', risk: { hold: false } },
      },
      orderRisk: { antigo: { level: 'alto', signals: [] }, novo: { level: 'baixo', signals: [] } },
    };
    await runRetention(fakeDb(data) as never, fakeAuth([]) as never, NOW);
    expect(Object.keys(data.orderRisk)).toEqual(['novo']);
  });

  it('nota fiscal: 5 anos contados do ano seguinte ao da emissão', async () => {
    expect(nfeCutoffIso(new Date('2032-03-01T12:00:00Z'))).toBe('2027-01-01T00:00:00.000Z');
    const data: Record<string, Record<string, Doc>> = {
      'orders/o1/nfeDocs': {
        velha: { createdAt: '2020-12-30T10:00:00.000Z', xml: '<nfe/>' },
        noPrazo: { createdAt: '2021-01-02T10:00:00.000Z', xml: '<nfe/>' },
      },
      'orders/o2/nfeDocs': { nova: { createdAt: daysAgo(30), xml: '<nfe/>' } },
    };
    const r = await runRetention(fakeDb(data) as never, fakeAuth([]) as never, NOW);
    expect(r.nfeDeleted).toBe(1);
    expect(Object.keys(data['orders/o1/nfeDocs'])).toEqual(['noPrazo']);
    expect(Object.keys(data['orders/o2/nfeDocs'])).toEqual(['nova']);
  });

  it('atendimento e trocas com mais de 5 anos saem com anexos e fotos', async () => {
    const data: Record<string, Record<string, Doc>> = {
      conversations: {
        velha: { customerEmail: 'a@x.com', lastMessageAt: daysAgo(6 * 365) },
        nova: { customerEmail: 'b@x.com', lastMessageAt: daysAgo(20) },
      },
      'conversations/velha/messages': {
        email1: { direction: 'inbound', attachments: [{ filename: 'foto.jpg' }] },
        resposta: { direction: 'outbound', text: 'Oi' },
      },
      'conversations/nova/messages': { email2: { direction: 'inbound', attachments: [{ filename: 'nota.pdf' }] } },
      returns: {
        velha: { createdAt: daysAgo(6 * 365), fotos: ['returns/u1/1_0.jpg', 'returns/u1/1_1.jpg'] },
        nova: { createdAt: daysAgo(40), fotos: ['returns/u2/2_0.jpg'] },
      },
    };
    const files = fakeFiles();
    const r = await runRetention(fakeDb(data) as never, fakeAuth([]) as never, NOW, files);
    expect(r).toMatchObject({ conversationsDeleted: 1, returnsDeleted: 1 });
    expect(Object.keys(data.conversations)).toEqual(['nova']);
    expect(data['conversations/velha/messages']).toEqual({});
    expect(Object.keys(data['conversations/nova/messages'])).toEqual(['email2']);
    expect(files.prefixes).toEqual(['email-attachments/email1/']);
    // Os anexos antigos, que eram públicos, são fechados todo dia (os já fechados não mudam).
    expect(files.privatized).toEqual(['email-attachments/']);
    expect(r.attachmentsPrivatized).toBe(2);
    expect(Object.keys(data.returns)).toEqual(['nova']);
    expect(files.paths).toEqual(['returns/u1/1_0.jpg', 'returns/u1/1_1.jpg']);
  });

  it('tira o e-mail da equipe do status público da manutenção', async () => {
    const data: Record<string, Record<string, Doc>> = {
      maintenance: { status: { active: false, updatedBy: 'equipe@loja.com', updatedAt: daysAgo(3) } },
    };
    await runRetention(fakeDb(data) as never, fakeAuth([]) as never, NOW);
    expect(data.maintenance.status).toMatchObject({ active: false, updatedBy: 'Equipe' });

    data.maintenance.status.updatedBy = 'Maria Souza';
    await runRetention(fakeDb(data) as never, fakeAuth([]) as never, NOW);
    expect(data.maintenance.status.updatedBy).toBe('Maria Souza');
  });
});
