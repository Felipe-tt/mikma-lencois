import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { PasskeyError, registerPasskey, registrationOptions } from '@/lib/passkeys';

/**
 * Cadastro de passkey pela conta logada, em dois passos no mesmo endereço:
 * { step: 'options' } devolve o desafio; { step: 'verify', challengeId,
 * response } confere o que o aparelho criou e salva a chave pública.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const { uid, email, name, firebase } = auth.decoded;
  if (!email || firebase?.sign_in_provider === 'anonymous') {
    return NextResponse.json({ error: 'Entre com sua conta para criar uma passkey.' }, { status: 403 });
  }
  if (!await rateLimit(`passkey-register:${uid}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null) as { step?: string; challengeId?: unknown; response?: unknown } | null;
  try {
    if (body?.step === 'options') {
      return NextResponse.json(await registrationOptions({ uid, email, name: typeof name === 'string' ? name : undefined }));
    }
    if (body?.step === 'verify' && body.response && typeof body.response === 'object') {
      const passkey = await registerPasskey(uid, body.challengeId, body.response as Parameters<typeof registerPasskey>[2], req.headers.get('user-agent'));
      return NextResponse.json({ passkey });
    }
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  } catch (err) {
    if (err instanceof PasskeyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[passkey/register]', err);
    return NextResponse.json({ error: 'Não foi possível criar a passkey. Tente de novo.' }, { status: 500 });
  }
}
