import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Firestore em memória (mesmo padrão do teste de update-status) ──────────
const orders: Record<string, Record<string, unknown>> = {};
const users: Record<string, Record<string, unknown>> = {};
const settingsDocs: Record<string, Record<string, unknown>> = {};

function flattenPatch(current: Record<string, unknown> | undefined, patch: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (key.includes('.')) {
      const [top, ...rest] = key.split('.');
      const sub = rest.join('.');
      result[top] = { ...(result[top] as Record<string, unknown> ?? {}), [sub]: value };
    } else if (key === 'timeline') {
      const existing = (result.timeline as unknown[]) ?? [];
      result.timeline = [...existing, value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function makeDocRef(store: Record<string, Record<string, unknown>>, id: string) {
  return {
    get: async () => ({ exists: id in store, id, data: () => store[id] }),
    update: vi.fn(async (patch: Record<string, unknown>) => {
      store[id] = flattenPatch(store[id], patch);
    }),
  };
}

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'MOCK_TIMESTAMP',
    arrayUnion: (v: unknown) => v,
    delete: () => undefined,
  },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
    getUser: vi.fn(async () => ({ email: 'cliente@example.com' })),
  },
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => makeDocRef(
        name === 'orders' ? orders : name === 'users' ? users : settingsDocs,
        id
      ),
    }),
    // Transação simplificada: lê e aplica na hora (o teste é sequencial).
    runTransaction: async <T,>(fn: (tx: {
      get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
      update: (ref: { update: (p: Record<string, unknown>) => Promise<void> }, patch: Record<string, unknown>) => void;
    }) => Promise<T>) => {
      const pending: Array<() => Promise<void>> = [];
      const result = await fn({
        get: ref => ref.get(),
        update: (ref, patch) => { pending.push(() => ref.update(patch)); },
      });
      for (const apply of pending) await apply();
      return result;
    },
  },
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: vi.fn(async () => true),
  rateLimitRetryAfter: vi.fn(() => 0),
}));

vi.mock('@/lib/shipping-ledger', () => ({
  recordShippingSpent: vi.fn(async () => {}),
}));

vi.mock('@/lib/uber-direct', () => ({
  uberCreateDelivery: vi.fn(),
  uberCancelDelivery: vi.fn(),
  uberDirectConfigured: vi.fn(() => false),
  uberQuote: vi.fn(),
  buildUberAddress: vi.fn(() => '{}'),
  formatPhone: (p: string) => p,
}));

import { adminAuth } from '@/lib/firebase/admin';
import { POST, DELETE } from './route';

function req(method: 'POST' | 'DELETE', body: unknown, token = 'valid-token') {
  return new NextRequest('https://mikma.com.br/api/delivery', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

const validAddress = {
  cep: '89010-000', street: 'Rua Teste', number: '123',
  neighborhood: 'Centro', city: 'Blumenau', state: 'SC',
};

describe('POST /api/delivery (despacho)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(orders)) delete orders[k];
    for (const k of Object.keys(users)) delete users[k];
    for (const k of Object.keys(settingsDocs)) delete settingsDocs[k];
    (adminAuth.verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue({ uid: 'seller-1', role: 'seller' });
  });

  it('rejeita sem token', async () => {
    const res = await POST(req('POST', { orderId: 'order-1' }, ''));
    expect(res.status).toBe(401);
  });

  it('rejeita quem não é seller/admin', async () => {
    (adminAuth.verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue({ uid: 'buyer-1', role: '' });
    const res = await POST(req('POST', { orderId: 'order-1' }));
    expect(res.status).toBe(403);
  });

  it('rejeita pedido inexistente', async () => {
    const res = await POST(req('POST', { orderId: 'order-inexistente' }));
    expect(res.status).toBe(404);
  });

  it('rejeita pedido em status que não pode ser despachado', async () => {
    orders['order-1'] = { status: 'shipped', items: [], delivery: {} };
    const res = await POST(req('POST', { orderId: 'order-1' }));
    expect(res.status).toBe(409);
  });

  it('retirada na loja: avança pra shipped', async () => {
    orders['order-1'] = { status: 'paid', items: [], delivery: { carrier: 'pickup' } };
    const res = await POST(req('POST', { orderId: 'order-1' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.carrier).toBe('pickup');
    expect(orders['order-1'].status).toBe('shipped');
  });

  it('Correios/Jadlog: não despacha por aqui (é manual, com código de rastreio)', async () => {
    for (const carrier of ['correios_sedex', 'correios_pac', 'jadlog_package']) {
      orders['order-1'] = {
        status: 'paid',
        userId: 'user-1',
        items: [{ productId: 'p1', productName: 'Lençol', quantity: 1, unitPrice: 30000 }],
        address: validAddress,
        delivery: { carrier, priceCents: 4500, realPriceCents: 4500 },
      };
      const res = await POST(req('POST', { orderId: 'order-1' }));
      expect(res.status).toBe(400);
      expect(orders['order-1'].status).toBe('paid');
    }
  });
});

describe('DELETE /api/delivery (cancelamento)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(orders)) delete orders[k];
    (adminAuth.verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue({ uid: 'seller-1', role: 'seller', email: 'seller@mikma.com.br' });
  });

  it('rejeita cancelar pedido que não está "shipped"', async () => {
    orders['order-1'] = { status: 'preparing', delivery: {} };
    const res = await DELETE(req('DELETE', { orderId: 'order-1', reason: 'teste' }));
    expect(res.status).toBe(409);
  });

  it('despacho manual: reverte pra preparing e limpa os dados de entrega', async () => {
    orders['order-1'] = { status: 'shipped', delivery: { carrier: 'correios_sedex', trackingCode: 'AA123456789BR' } };

    const res = await DELETE(req('DELETE', { orderId: 'order-1', reason: 'endereço errado' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(orders['order-1'].status).toBe('preparing');
    const delivery = orders['order-1'].delivery as Record<string, unknown>;
    expect(delivery.carrier).toBeNull();
    expect(delivery.trackingCode).toBeNull();
  });
});
