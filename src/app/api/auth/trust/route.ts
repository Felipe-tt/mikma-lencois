import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, verifyAuth } from '@/lib/security';
import { trustLogin } from '@/lib/auth/loginTicket';

/**
 * Chamada pelo navegador logo depois de entrar com senha: troca o ticket
 * que a checagem do site deixou por "este login é confiável" (ver
 * lib/auth/loginTicket.ts). Sem ticket, responde trusted: false; a conta
 * funciona, só CPF, exportar e apagar a conta pedem para entrar de novo.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const key = `auth-trust:ip:${ip}`;
  if (!await rateLimit(key, 30, 15 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(key));
  const auth = await verifyAuth(req, { allowWithoutSecondFactor: true });
  if (!auth.ok) return auth.response;
  const trusted = await trustLogin(adminDb, auth.decoded);
  return NextResponse.json({ trusted }, { headers: { 'Cache-Control': 'private, no-store' } });
}
