export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp, verifyAuth } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { z } from 'zod';

const schema = z.object({
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const key = `update-pwd:${ip}`;
  if (!rateLimit(key, 5, 15 * 60 * 1000)) {
    const retryAfter = Math.ceil(rateLimitRetryAfter(key) / 1000);
    return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  const authResult = await verifyAuth(req);
  if (!authResult.ok) return authResult.response;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  try {
    const { hash } = await import('@node-rs/argon2');
    const passwordHash = await hash(parsed.data.password, {
      memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32,
    });
    await adminDb.collection('users').doc(authResult.decoded.uid).update({ passwordHash });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
