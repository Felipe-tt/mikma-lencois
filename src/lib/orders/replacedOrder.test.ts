import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;
const orders: Record<string, Doc> = {};
const released: Array<[unknown, unknown]> = [];

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'agora', arrayUnion: (...v: unknown[]) => ({ arrayUnion: v }) },
}));
vi.mock('@/lib/orders/couponUsage', () => ({
  releaseCouponUse: async (code: unknown, uid: unknown) => { released.push([code, uid]); },
}));
vi.mock('@/lib/firebase/admin', () => {
  const snap = (id: string) => ({ id, exists: !!orders[id], data: () => orders[id], get: (f: string) => orders[id]?.[f] });
  const query = (filters: [string, string, unknown][] = [], lim = Infinity) => ({
    where: (f: string, op: string, v: unknown) => query([...filters, [f, op, v]], lim),
    limit: (n: number) => query(filters, n),
    get: async () => {
      const docs = Object.keys(orders)
        .filter(id => filters.every(([f, op, v]) => op === 'in' ? (v as unknown[]).includes(orders[id][f]) : orders[id][f] === v))
        .slice(0, lim)
        .map(snap);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  return {
    adminDb: {
      collection: () => ({ ...query(), doc: (id: string) => ({ id }) }),
      runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({
        get: async (ref: { id: string }) => snap(ref.id),
        update: (ref: { id: string }, data: Doc) => { orders[ref.id] = { ...orders[ref.id], ...data }; },
      }),
    },
  };
});

const { paidReplacement, cancelOrdersReplacedBy } = await import('./replacedOrder');

const item = (sku: string) => ({ sku, quantity: 1 });
const at = (h: number) => new Date(Date.UTC(2026, 10, 20, h)).toISOString();

beforeEach(() => {
  for (const k of Object.keys(orders)) delete orders[k];
  released.length = 0;
});

describe('pedido refeito', () => {
  it('acha o pedido pago feito depois, com o mesmo produto', async () => {
    orders.velho = { userId: 'u1', status: 'payment_expired', createdAt: at(10), items: [item('p1_v1'), item('p4_v1')] };
    orders.novo = { userId: 'u1', status: 'paid', createdAt: at(11), items: [item('p1_v1')] };
    expect(await paidReplacement(orders.velho)).toBe('novo');
  });

  it('aceita a data gravada como Timestamp', async () => {
    const ts = (h: number) => ({ toDate: () => new Date(at(h)) });
    orders.velho = { userId: 'u1', status: 'payment_expired', createdAt: ts(10), items: [item('p1_v1')] };
    orders.novo = { userId: 'u1', status: 'shipped', createdAt: ts(12), items: [item('p1_v1')] };
    expect(await paidReplacement(orders.velho)).toBe('novo');
  });

  it('não conta pedido pago antes, de outro produto, de outro cliente ou ainda sem pagamento', async () => {
    orders.velho = { userId: 'u1', status: 'payment_expired', createdAt: at(10), items: [item('p1_v1')] };
    orders.antes = { userId: 'u1', status: 'delivered', createdAt: at(9), items: [item('p1_v1')] };
    orders.outroProduto = { userId: 'u1', status: 'paid', createdAt: at(11), items: [item('p2_v1')] };
    orders.outroCliente = { userId: 'u2', status: 'paid', createdAt: at(11), items: [item('p1_v1')] };
    orders.semPagar = { userId: 'u1', status: 'pending_payment', createdAt: at(11), items: [item('p1_v1')] };
    expect(await paidReplacement(orders.velho)).toBeNull();
  });

  it('pago o pedido novo, o velho com o PIX vencido sai sem e-mail e devolve o cupom', async () => {
    orders.velho = { userId: 'u1', status: 'payment_expired', createdAt: at(10), items: [item('p1_v1')], couponCode: 'BEMVINDO' };
    orders.novo = { userId: 'u1', status: 'paid', createdAt: at(11), items: [item('p1_v1')] };
    expect(await cancelOrdersReplacedBy('novo', orders.novo)).toBe(1);
    expect(orders.velho).toMatchObject({ status: 'cancelled', replacedBy: 'novo', cancelledBy: 'sistema' });
    expect(JSON.stringify(orders.velho.timeline)).toContain('refez a compra no pedido #NOVO');
    expect(released).toEqual([['BEMVINDO', 'u1']]);
  });

  it('não mexe no pedido ainda pagável, no de outro produto nem no feito depois', async () => {
    orders.pixValendo = { userId: 'u1', status: 'pending_payment', createdAt: at(10), items: [item('p1_v1')] };
    orders.outroProduto = { userId: 'u1', status: 'payment_expired', createdAt: at(10), items: [item('p2_v1')] };
    orders.depois = { userId: 'u1', status: 'payment_expired', createdAt: at(12), items: [item('p1_v1')] };
    orders.novo = { userId: 'u1', status: 'paid', createdAt: at(11), items: [item('p1_v1')] };
    expect(await cancelOrdersReplacedBy('novo', orders.novo)).toBe(0);
    expect(orders.pixValendo.status).toBe('pending_payment');
    expect(orders.outroProduto.status).toBe('payment_expired');
    expect(orders.depois.status).toBe('payment_expired');
    expect(released).toEqual([]);
  });
});
