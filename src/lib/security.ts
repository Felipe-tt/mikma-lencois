import { NextRequest, NextResponse } from 'next/server';

/** Extrai o IP real do cliente, respeitando proxies confiáveis (Cloud Run / Vercel). */
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? req.headers.get('x-nf-client-connection-ip') ?? 'unknown';
}

interface SafeJsonOk<T = unknown> { ok: true; data: T }
interface SafeJsonErr { ok: false; response: NextResponse }
type SafeJsonResult<T = unknown> = SafeJsonOk<T> | SafeJsonErr;

/**
 * Lê e parseia o body JSON com limite de tamanho.
 * Retorna { ok: true, data } ou { ok: false, response } com 400/413.
 */
export async function safeJson<T = unknown>(
  req: NextRequest,
  maxBytes = 8192
): Promise<SafeJsonResult<T>> {
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Payload muito grande' }, { status: 413 }),
    };
  }
  try {
    const text = await req.text();
    if (text.length > maxBytes) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Payload muito grande' }, { status: 413 }),
      };
    }
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'JSON inválido' }, { status: 400 }),
    };
  }
}

/**
 * Verifica Authorization Bearer e retorna o token ou NextResponse 401.
 */
export function extractBearer(req: NextRequest): { token: string } | { response: NextResponse } {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  }
  return { token: auth.slice(7) };
}

/** Retorna uma resposta 429 com Retry-After. */
export function tooManyRequests(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
  );
}
