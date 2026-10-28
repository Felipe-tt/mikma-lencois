import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { authenticate, authenticationOptions, PasskeyError } from '@/lib/passkeys';

/**
 * Entrar com passkey, em dois passos: { step: 'options' } devolve o
 * desafio; { step: 'verify', challengeId, response } confere a assinatura
 * e devolve o custom token do Firebase (o navegador entra com ele).
 * Sem reCAPTCHA nem confirmação por e-mail: a passkey só existe no
 * aparelho da pessoa e o navegador só a entrega para este domínio.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const key = `passkey-login:ip:${ip}`;
  if (!await rateLimit(key, 30, 15 * 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } },
    );
  }

  const body = await req.json().catch(() => null) as { step?: string; challengeId?: unknown; response?: unknown } | null;
  try {
    if (body?.step === 'options') {
      return NextResponse.json(await authenticationOptions(), { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body?.step === 'verify' && body.response && typeof body.response === 'object') {
      const { token } = await authenticate(body.challengeId, body.response as Parameters<typeof authenticate>[1]);
      return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  } catch (err) {
    if (err instanceof PasskeyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[passkey/login]', err);
    return NextResponse.json({ error: 'Não foi possível entrar com a passkey. Tente de novo.' }, { status: 500 });
  }
}
