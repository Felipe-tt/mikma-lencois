import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;
const data: Record<string, Record<string, Doc>> = {};
const authUsers: Record<string, { email?: string; displayName?: string; providerData: unknown[] }> = {};
const sent: { to: string; subject: string; text: string }[] = [];
let failNext: string | null = null;

function ref(col: string, id: string) {
  return {
    id,
    get: async () => ({ exists: !!data[col]?.[id], data: () => data[col]?.[id] }),
    update: async (v: Doc) => { data[col][id] = { ...data[col][id], ...v }; },
  };
}
function query(col: string, filters: [string, string, unknown][] = []) {
  const get = (d: Doc, path: string) => path.split('.').reduce<unknown>((o, k) => (o as Doc | undefined)?.[k], d);
  return {
    where: (f: string, op: string, v: unknown) => query(col, [...filters, [f, op, v]]),
    orderBy: () => query(col, filters),
    limit: () => query(col, filters),
    get: async () => {
      const docs = Object.entries(data[col] ?? {})
        .filter(([, d]) => filters.every(([f, op, v]) => {
          const x = get(d, f);
          if (op === '==') return x === v;
          const t = (x as Date)?.getTime?.() ?? NaN;
          return op === '>=' ? t >= (v as Date).getTime() : t <= (v as Date).getTime();
        }))
        .map(([id, d]) => ({ id, ref: ref(col, id), data: () => d }));
      return { docs, size: docs.length };
    },
  };
}

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: (col: string) => ({ ...query(col), doc: (id: string) => ref(col, id) }) },
  adminAuth: {
    getUser: async (uid: string) => {
      const u = authUsers[uid];
      if (!u) throw new Error('not found');
      return u;
    },
  },
}));
vi.mock('@/lib/email', () => ({
  emailEnabled: () => true,
  sendEmail: async (m: { to: string; subject: string; text: string }) => {
    if (failNext) { const code = failNext; failNext = null; throw Object.assign(new Error(code), { code }); }
    sent.push(m);
  },
}));

const { sendReviewReminders, reviewReminderEmail } = await import('./reviewReminders');

const NOW = new Date('2026-11-04T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);
const order = (userId: string, deliveredDaysAgo: number, items: [string, string][], extra: Doc = {}) => ({
  userId, status: 'delivered', delivery: { deliveredAt: daysAgo(deliveredDaysAgo) },
  items: items.map(([productId, productName]) => ({ productId, productName })), ...extra,
});

beforeEach(() => {
  for (const k of Object.keys(data)) delete data[k];
  for (const k of Object.keys(authUsers)) delete authUsers[k];
  sent.length = 0;
  failNext = null;
  authUsers.ana = { email: 'ana@x.com', providerData: [{ providerId: 'password' }] };
  authUsers.convidado = { providerData: [] };
  data.users = { ana: { email: 'ana@x.com', name: 'Ana Souza' }, convidado: { email: 'c@x.com' } };
});

describe('lembrete de avaliação', () => {
  it('manda um lembrete só dos produtos sem avaliação, uma vez por pedido', async () => {
    data.orders = { p1: order('ana', 6, [['lencol', 'Lençol Floral'], ['fronha', 'Fronha Lisa']]) };
    data.reviews = { r1: { orderId: 'p1', productId: 'fronha' } };

    const r = await sendReviewReminders(NOW);
    expect(r.sent).toBe(1);
    expect(sent[0].to).toBe('ana@x.com');
    expect(sent[0].subject).toBe('O que achou do Lençol Floral?');
    expect(sent[0].text).toContain('/produtos/lencol#avaliacoes');
    expect(sent[0].text).not.toContain('fronha#');
    expect(data.orders.p1.reviewReminderAt).toBe(NOW.toISOString());

    const again = await sendReviewReminders(NOW);
    expect(again.sent).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('não manda cedo demais, para entrega antiga, para convidado nem para quem já avaliou tudo', async () => {
    data.orders = {
      cedo: order('ana', 2, [['a', 'A']]),
      velho: order('ana', 40, [['a', 'A']]),
      convidado: order('convidado', 6, [['a', 'A']]),
      avaliado: order('ana', 7, [['a', 'A']]),
      cancelado: order('ana', 6, [['a', 'A']], { status: 'cancelled' }),
    };
    data.reviews = { r: { orderId: 'avaliado', productId: 'a' } };

    const r = await sendReviewReminders(NOW);
    expect(sent).toHaveLength(0);
    expect(r.skipped).toBe(2);
    expect(data.orders.convidado.reviewReminderResult).toBe('sem login');
    expect(data.orders.avaliado.reviewReminderResult).toBe('ja avaliado');
    expect(data.orders.cedo.reviewReminderAt).toBeUndefined();
  });

  it('falha passageira do e-mail não marca o pedido (tenta de novo amanhã)', async () => {
    data.orders = { p1: order('ana', 6, [['a', 'A']]) };
    failNext = 'rate_limit_exceeded';
    await sendReviewReminders(NOW);
    expect(data.orders.p1.reviewReminderAt).toBeUndefined();

    failNext = 'invalid_to_address';
    await sendReviewReminders(NOW);
    expect(data.orders.p1.reviewReminderResult).toBe('email recusado');
  });

  it('com vários produtos, lista cada um e escapa o nome', () => {
    const m = reviewReminderEmail('Bia', 'abcdef123456', [
      { productId: 'a', productName: 'Lençol <Rosa>' },
      { productId: 'b', productName: 'Fronha' },
    ]);
    expect(m.subject).toBe('O que achou da sua compra?');
    expect(m.html).toContain('Lençol &lt;Rosa&gt;');
    expect(m.html).not.toContain('<Rosa>');
    expect(m.html).toContain('/conta/pedidos');
  });
});
