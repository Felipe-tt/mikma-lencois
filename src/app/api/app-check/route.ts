import { NextRequest, NextResponse } from 'next/server';
import { getAdminAppCheck } from '@/lib/firebase/admin';
import { verifyRecaptcha } from '@/lib/recaptcha';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, safeJson, tooManyRequests } from '@/lib/security';

/**
 * Provedor próprio do App Check (src/lib/firebase/appCheck.ts): o navegador
 * resolve o Cloudflare Turnstile (grátis, quase sempre invisível) e troca o
 * token por um token do App Check, que vai junto em cada pedido ao
 * Firestore e ao Storage. O reCAPTCHA v3 do Firebase foi descontinuado e o
 * substituto (reCAPTCHA Enterprise) é pago acima de 10 mil por mês.
 *
 * O token vale 12 h e o Firebase guarda no navegador, então cada visitante
 * passa por aqui uma vez a cada 12 h.
 */
const APP_CHECK_TTL_MS = 12 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const key = `app-check:ip:${ip}`;
  if (!await rateLimit(key, 30, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(key));

  const body = await safeJson<{ token?: unknown }>(req, 4096);
  if (!body.ok) return body.response;
  const token = typeof body.data?.token === 'string' ? body.data.token : undefined;
  if (!await verifyRecaptcha(token, 'app_check')) {
    return NextResponse.json({ error: 'Verificação falhou' }, { status: 403 });
  }

  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!appId) return NextResponse.json({ error: 'App Check indisponível' }, { status: 503 });
  try {
    const result = await getAdminAppCheck().createToken(appId, { ttlMillis: APP_CHECK_TTL_MS });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[app-check] falha ao emitir token', err);
    return NextResponse.json({ error: 'App Check indisponível' }, { status: 503 });
  }
}
