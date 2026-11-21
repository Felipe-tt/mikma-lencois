import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

let allowed = true;
let alertAllowed = true;
const rateLimit = vi.fn(async (key: string) => (key.startsWith('pii-view-alert:') ? alertAllowed : allowed));
const notifyPiiScan = vi.fn(async (..._args: unknown[]) => {});
const logged: unknown[] = [];
let role = 'seller';

vi.mock('@/lib/rateLimit', () => ({ rateLimit }));
vi.mock('@/lib/staffDevices', () => ({ notifyPiiScan }));
vi.mock('@/lib/piiCrypto', () => ({ readPii: () => ({ cpf: '52998224725', phone: '47999990000' }) }));
vi.mock('@/lib/security', () => ({
  getClientIp: () => '203.0.113.9',
  verifyAuth: async () => (role === 'seller' || role === 'admin'
    ? { ok: true, decoded: { uid: 'vendedor1', email: 'vendedor@mikma.com.br' } }
    : { ok: false, response: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }),
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (c: string) => c === 'piiAccessLog'
      ? { add: async (d: unknown) => { logged.push(d); } }
      : { doc: (id: string) => ({ get: async () => ({ exists: id === 'cliente1', data: () => ({}) }) }) },
  },
}));

const { GET } = await import('./route');
const call = (uid: string) => GET(new NextRequest(`https://mikma.com.br/api/painel/clientes/${uid}/pii`), { params: Promise.resolve({ uid }) });

describe('CPF e telefone de cliente para a equipe', () => {
  beforeEach(() => {
    allowed = true; alertAllowed = true; role = 'seller'; logged.length = 0;
    rateLimit.mockClear(); notifyPiiScan.mockClear();
  });

  it('abre e registra quem abriu de quem', async () => {
    const res = await call('cliente1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cpf: '52998224725', phone: '47999990000' });
    expect(logged).toEqual([expect.objectContaining({ by: 'vendedor1', customer: 'cliente1' })]);
    expect(rateLimit).toHaveBeenCalledWith('pii-view:vendedor1', 120, 3_600_000);
  });

  it('passou do teto da hora: recusa, não registra e avisa uma vez', async () => {
    allowed = false;
    const res = await call('cliente1');
    expect(res.status).toBe(429);
    expect(logged).toEqual([]);
    expect(notifyPiiScan).toHaveBeenCalledWith(expect.objectContaining({ uid: 'vendedor1', email: 'vendedor@mikma.com.br', perHour: 120 }));
    alertAllowed = false;
    expect((await call('cliente1')).status).toBe(429);
    expect(notifyPiiScan).toHaveBeenCalledTimes(1);
  });

  it('fora da equipe não abre', async () => {
    role = 'buyer';
    expect((await call('cliente1')).status).toBe(403);
    expect(logged).toEqual([]);
  });
});
