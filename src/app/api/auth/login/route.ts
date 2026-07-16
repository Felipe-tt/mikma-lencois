export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';

const schema = z.object({
  email: z.string().email().max(256),
  password: z.string().min(1).max(256),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipKey = `login:ip:${ip}`;
  if (!await rateLimit(ipKey, 10, 15 * 60 * 1000)) {
    const retryAfter = Math.ceil(rateLimitRetryAfter(ipKey) / 1000);
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

    const { email } = parsed.data;
    const emailKey = `login:email:${email.toLowerCase()}`;
    if (!await rateLimit(emailKey, 8, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 });
    }

    // Rate limit ok — o Firebase Auth no cliente faz a validação real da senha
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
