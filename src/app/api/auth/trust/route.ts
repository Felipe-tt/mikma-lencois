import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, verifyAuth } from '@/lib/security';
import { TICKET_TTL_MS, isTicketShape, needsGoogleCheck, needsTicket, trustLogin } from '@/lib/auth/loginTicket';

/**
 * Chamada pelo navegador depois de entrar com senha ou Google (e uma vez por sessão,
 * para saber se o login vale): troca o ticket que a checagem do site deu a
 * este navegador ({ ticket } no corpo) por "este login é confiável" (ver
 * lib/auth/loginTicket.ts). Sem ticket válido, responde trusted: false;
 * endereço, pedidos, CPF e a conta pedem para entrar de novo, e a loja
 * mostra o aviso.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const key = `auth-trust:ip:${ip}`;
  if (!await rateLimit(key, 30, 15 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(key));
  const auth = await verifyAuth(req, { allowWithoutSecondFactor: true });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as { ticket?: unknown } | null;
  const ticket = isTicketShape(body?.ticket) ? body.ticket : undefined;
  const trusted = await trustLogin(adminDb, auth.decoded, ticket, Date.now(), { getUser: uid => adminAuth.getUser(uid) });
  // Google que não confere com a conta: alguém vinculou o próprio Google à
  // conta da pessoa (com a senha dela), ou a conta mudou fora do site.
  if (!trusted && needsGoogleCheck(auth.decoded)) {
    Sentry.captureMessage('Entrada pelo Google que não confere com a conta (Google de outra pessoa ou conta mudada por fora)', 'warning');
  }
  // Login com senha recém-feito pela loja sem ticket: ou alguém entrou
  // direto no Firebase, ou o fluxo do ticket quebrou e clientes de verdade
  // estão vendo o aviso. A equipe precisa saber do segundo caso.
  if (!trusted && needsTicket(auth.decoded) && Date.now() - auth.decoded.auth_time * 1000 < TICKET_TTL_MS) {
    Sentry.captureMessage('Login com senha sem ticket logo depois de entrar', 'warning');
  }
  return NextResponse.json({ trusted }, { headers: { 'Cache-Control': 'private, no-store' } });
}
