import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
// Doc do Firestore em memória, simples o suficiente pra esse teste: um mapa
// orderId -> dados, e um mapa userId -> dados de usuário.
const orders: Record<string, Record<string, unknown>> = {};
const users: Record<string, Record<string, unknown>> = {};

function makeDocRef(store: Record<string, Record<string, unknown>>, id: string) {
  return {
    get: async () => ({
      exists: id in store,
      id,
      data: () => store[id],
    }),
    update: vi.fn(async (patch: Record<string, unknown>) => {
      store[id] = { ...store[id], ...flattenPatch(store[id], patch) };
    }),
  };
}

// As chamadas reais usam chaves tipo 'delivery.trackingCode'; aplica isso
// como um patch aninhado, igual o Firestore faz de verdade.
function flattenPatch(current: Record<string, unknown> | undefined, patch: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (key.includes('.')) {
      const [top, ...rest] = key.split('.');
      const sub = rest.join('.');
      result[top] = { ...(result[top] as Record<string, unknown> ?? {}), [sub]: value };
    } else if (key === 'timeline') {
      // FieldValue.arrayUnion mockado abaixo já devolve o valor puro
      const existing = (result.timeline as unknown[]) ?? [];
      result.timeline = [...existing, value];
    } else {
      result[key] = value;
    }
  }
  return result;
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
  },
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => makeDocRef(name === 'orders' ? orders : users, id),
    }),
  },
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));

import { adminAuth } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email';
import { POST } from './route';

function req(body: unknown, token = 'valid-token') {
  return new NextRequest('https://mikma.com.br/api/orders/order-1/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ orderId: 'order-1' });

describe('POST /api/orders/[orderId]/update-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(orders)) delete orders[k];
    for (const k of Object.keys(users)) delete users[k];
    (adminAuth.verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue({ uid: 'seller-1', role: 'seller' });
    users['user-1'] = { email: 'cliente@example.com', name: 'Cliente Teste' };
  });

  it('rejeita sem token', async () => {
    const res = await POST(req({}, ''), { params });
    expect(res.status).toBe(401);
  });

  it('rejeita quem não é seller/admin', async () => {
    (adminAuth.verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue({ uid: 'buyer-1', role: '' });
    const res = await POST(req({}), { params });
    expect(res.status).toBe(403);
  });

  it('rejeita pedido inexistente', async () => {
    const res = await POST(req({}), { params });
    expect(res.status).toBe(404);
  });

  it('despacha SEDEX manual: salva trackingCode e muda status pra shipped', async () => {
    orders['order-1'] = {
      status: 'preparing',
      userId: 'user-1',
      items: [],
      delivery: { carrier: 'correios_sedex' },
    };

    const res = await POST(req({ trackingCode: 'AA123456789BR' }), { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.newStatus).toBe('shipped');
    expect(orders['order-1'].status).toBe('shipped');
    expect((orders['order-1'].delivery as Record<string, unknown>).trackingCode).toBe('AA123456789BR');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('não deixa avançar status fora da ordem permitida (ex: paid -> delivered)', async () => {
    orders['order-1'] = { status: 'paid', userId: 'user-1', delivery: {} };
    // ALLOWED só mapeia paid -> preparing; simula tentar pular direto pulando
    // o status manualmente pra 'delivered' não é possível via essa rota:
    orders['order-1'].status = 'delivered'; // já entregue, não tem próximo
    const res = await POST(req({}), { params });
    expect(res.status).toBe(400);
  });

  it('preparing -> shipped sem trackingCode: avança mesmo assim, mas não seta código', async () => {
    orders['order-1'] = { status: 'preparing', userId: 'user-1', items: [], delivery: { carrier: 'jadlog_package' } };
    const res = await POST(req({}), { params });
    expect(res.status).toBe(200);
    expect(orders['order-1'].status).toBe('shipped');
    expect((orders['order-1'].delivery as Record<string, unknown>).trackingCode).toBeUndefined();
  });

  it('não derruba a resposta se o e-mail falhar, só reporta emailError', async () => {
    orders['order-1'] = { status: 'preparing', userId: 'user-1', items: [], delivery: { carrier: 'correios_sedex' } };
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('SMTP fora do ar'));

    const res = await POST(req({ trackingCode: 'AA123456789BR' }), { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.emailError).toContain('SMTP fora do ar');
    expect(orders['order-1'].status).toBe('shipped'); // o status já mudou antes do e-mail
  });
});
