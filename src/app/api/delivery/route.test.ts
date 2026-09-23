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
  },
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: vi.fn(async () => true),
  rateLimitRetryAfter: vi.fn(() => 0),
}));

const meDispatch = vi.fn();
const meCancel = vi.fn();
const meBalance = vi.fn();
vi.mock('@/lib/melhorenvio', () => ({
  meDispatch: (...args: unknown[]) => meDispatch(...args),
  meCancel: (...args: unknown[]) => meCancel(...args),
  meBalance: (...args: unknown[]) => meBalance(...args),
  ME_SERVICES: { correios_pac: 1, correios_sedex: 2, jadlog_package: 7, jadlog_expresso: 18 },
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
    process.env.MELHOR_ENVIO_TOKEN = 'fake-token-de-teste';
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

  it('retirada na loja: avança pra shipped sem chamar Melhor Envio', async () => {
    orders['order-1'] = { status: 'paid', items: [], delivery: { carrier: 'pickup' } };
    const res = await POST(req('POST', { orderId: 'order-1' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.carrier).toBe('pickup');
    expect(orders['order-1'].status).toBe('shipped');
    expect(meDispatch).not.toHaveBeenCalled();
  });

  it('bloqueia o despacho via Melhor Envio se o saldo for insuficiente (trava de segurança)', async () => {
    orders['order-1'] = {
      status: 'paid',
      userId: 'user-1',
      totalCents: 30000,
      items: [{ productId: 'p1', productName: 'Lençol', quantity: 1, unitPrice: 30000 }],
      address: validAddress,
      delivery: { carrier: 'correios_sedex', priceCents: 4500, realPriceCents: 4500 },
    };
    users['user-1'] = { name: 'Cliente', email: 'cliente@example.com', cpf: '00000000000', phone: '47999999999' };
    meBalance.mockResolvedValue(1000); // R$10, bem menos que os R$45 necessários

    const res = await POST(req('POST', { orderId: 'order-1' }));
    const json = await res.json();

    expect(res.status).toBe(402);
    expect(json.error).toContain('Saldo insuficiente');
    expect(meDispatch).not.toHaveBeenCalled();
    // Pedido não pode ter sido alterado se o despacho foi bloqueado
    expect(orders['order-1'].status).toBe('paid');
  });

  it('despacha via Melhor Envio com saldo suficiente e salva os dados retornados', async () => {
    orders['order-1'] = {
      status: 'paid',
      userId: 'user-1',
      totalCents: 30000,
      items: [{ productId: 'p1', productName: 'Lençol', quantity: 1, unitPrice: 30000 }],
      address: validAddress,
      delivery: { carrier: 'correios_sedex', priceCents: 4500, realPriceCents: 4500 },
    };
    users['user-1'] = { name: 'Cliente', email: 'cliente@example.com', cpf: '00000000000', phone: '47999999999' };
    meBalance.mockResolvedValue(100000); // saldo de sobra
    meDispatch.mockResolvedValue({ meOrderId: 'me-123', trackingCode: 'AA123456789BR', labelUrl: 'https://labels.example/1.pdf' });

    const res = await POST(req('POST', { orderId: 'order-1' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.trackingCode).toBe('AA123456789BR');
    expect(orders['order-1'].status).toBe('shipped');
    const delivery = orders['order-1'].delivery as Record<string, unknown>;
    expect(delivery.trackingCode).toBe('AA123456789BR');
    expect(delivery.melhorEnvioOrderId).toBe('me-123');
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

  it('se a Melhor Envio falhar ao cancelar, retorna 502 e NÃO reverte o pedido', async () => {
    orders['order-1'] = { status: 'shipped', delivery: { carrier: 'correios_sedex', melhorEnvioOrderId: 'me-123', trackingCode: 'AA123456789BR' } };
    meCancel.mockRejectedValue(new Error('ME fora do ar'));

    const res = await DELETE(req('DELETE', { orderId: 'order-1', reason: 'cliente desistiu' }));
    expect(res.status).toBe(502);
    // Como o cancelamento na ME falhou, o pedido tem que continuar "shipped"
    // do jeito que estava, senão a loja perde o rastro da etiqueta comprada.
    expect(orders['order-1'].status).toBe('shipped');
  });

  it('cancela com sucesso: reverte pra preparing e limpa os dados de entrega', async () => {
    orders['order-1'] = { status: 'shipped', delivery: { carrier: 'correios_sedex', melhorEnvioOrderId: 'me-123', trackingCode: 'AA123456789BR' } };
    meCancel.mockResolvedValue(undefined);

    const res = await DELETE(req('DELETE', { orderId: 'order-1', reason: 'cliente desistiu' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(orders['order-1'].status).toBe('preparing');
    const delivery = orders['order-1'].delivery as Record<string, unknown>;
    expect(delivery.carrier).toBeNull();
    expect(delivery.trackingCode).toBeNull();
    expect(meCancel).toHaveBeenCalledWith('me-123', expect.stringContaining('cliente desistiu'));
  });

  it('pedido sem melhorEnvioOrderId (despacho manual): não chama meCancel, só reverte', async () => {
    orders['order-1'] = { status: 'shipped', delivery: { carrier: 'correios_sedex', trackingCode: 'AA123456789BR' } };

    const res = await DELETE(req('DELETE', { orderId: 'order-1', reason: 'endereço errado' }));
    expect(res.status).toBe(200);
    expect(meCancel).not.toHaveBeenCalled();
    expect(orders['order-1'].status).toBe('preparing');
  });
});
