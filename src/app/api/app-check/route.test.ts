import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createToken = vi.fn(async (_appId: string, _opts: unknown) => ({ token: 'tok', ttlMillis: 43_200_000 }));
let human = true;

vi.mock('@/lib/firebase/admin', () => ({ getAdminAppCheck: () => ({ createToken }) }));
vi.mock('@/lib/rateLimit', () => ({ rateLimit: async () => true, rateLimitRetryAfter: () => 0 }));
vi.mock('@/lib/recaptcha', () => ({ verifyRecaptcha: async (t?: string, action?: string) => human && !!t && action === 'app_check' }));

const { POST } = await import('./route');
const call = (body: unknown) => POST(new NextRequest('http://localhost/api/app-check', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/app-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    human = true;
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:1:web:abc';
  });

  it('com o Turnstile aprovado, emite o token do App Check por 12 h', async () => {
    const res = await call({ token: 'turnstile' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: 'tok', ttlMillis: 43_200_000 });
    expect(createToken).toHaveBeenCalledWith('1:1:web:abc', { ttlMillis: 43_200_000 });
  });

  it('sem token ou com Turnstile reprovado, não emite nada', async () => {
    expect((await call({})).status).toBe(403);
    human = false;
    expect((await call({ token: 'x' })).status).toBe(403);
    expect(createToken).not.toHaveBeenCalled();
  });
});
