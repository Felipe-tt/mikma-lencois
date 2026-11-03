import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const triggerHoneytoken = vi.fn();
vi.mock('@/lib/honeytoken', async () => {
  const real = await vi.importActual<typeof import('@/lib/honeytoken')>('@/lib/honeytoken');
  return { ...real, triggerHoneytoken };
});
vi.mock('@/lib/firebase/admin', () => ({ adminAuth: {}, adminDb: {} }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));

process.env.STAFF_SESSION_SECRET = 'segredo-de-teste';
const { GET, POST } = await import('./route');
const { honeyApiKey } = await import('@/lib/honeytoken');

const ctx = { params: Promise.resolve({ path: ['pedidos'] }) };

describe('/api/v1 (armadilha)', () => {
  beforeEach(() => triggerHoneytoken.mockClear());

  it('chave qualquer: 401 sem alerta', async () => {
    const res = await GET(new NextRequest('https://mikma.com.br/api/v1/pedidos', { headers: { authorization: 'Bearer mk_live_qualquer' } }), ctx);
    expect(res.status).toBe(401);
    expect(triggerHoneytoken).not.toHaveBeenCalled();
  });

  it('chave falsa do banco: 401 e alerta', async () => {
    const key = honeyApiKey('segredo-de-teste');
    const res = await POST(new NextRequest('https://mikma.com.br/api/v1/pedidos', { method: 'POST', headers: { 'x-api-key': key } }), ctx);
    expect(res.status).toBe(401);
    expect(triggerHoneytoken).toHaveBeenCalledWith(expect.objectContaining({ kind: 'chave-api', detail: 'POST /api/v1/pedidos' }));
  });
});
