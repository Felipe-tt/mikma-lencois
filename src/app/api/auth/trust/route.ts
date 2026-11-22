import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, verifyAuth } from '@/lib/security';
import { TICKET_TTL_MS, isTicketShape, needsGoogleCheck, needsTicket, trustLogin } from '@/lib/auth/loginTicket';
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE, newDeviceId } from '@/lib/staffDevices';
import { customerLoginVia, isDeviceId, noteCustomerLogin } from '@/lib/userDevices';
import { requestPlace } from '@/lib/requestPlace';
import { emailEnabled, sendEmail } from '@/lib/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mikma.com.br';

/**
 * Chamada pelo navegador depois de entrar com senha ou Google (e uma vez por sessão,
 * para saber se o login vale): troca o ticket que a checagem do site deu a
 * este navegador ({ ticket } no corpo) por "este login é confiável" (ver
 * lib/auth/loginTicket.ts). Sem ticket válido, responde trusted: false;
 * endereço, pedidos, CPF e a conta pedem para entrar de novo, e a loja
 * mostra o aviso. Login de cliente que vale também registra o aparelho e,
 * se for novo, avisa a dona da conta por e-mail (noteDevice).
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
  const res = NextResponse.json({ trusted }, { headers: { 'Cache-Control': 'private, no-store' } });
  if (trusted) await noteDevice(req, auth.decoded, res);
  return res;
}

/**
 * Cliente entrou por um aparelho que a conta não usava: e-mail para a dona
 * (lib/userDevices.ts). Fica aqui, e não numa chamada à parte, porque quem
 * entra com a senha de outra pessoa precisa desta troca para ver os dados
 * da conta. Falha no aviso nunca segura o login.
 */
async function noteDevice(req: NextRequest, decoded: DecodedIdToken, res: NextResponse) {
  if (!customerLoginVia(decoded)) return;
  const saved = req.cookies.get(DEVICE_COOKIE)?.value;
  const deviceId = isDeviceId(saved) ? saved : newDeviceId();
  try {
    await noteCustomerLogin(adminDb, decoded, {
      deviceId,
      userAgent: req.headers.get('user-agent'),
      ip: getClientIp(req),
      place: requestPlace(req.headers),
    }, {
      getUser: uid => adminAuth.getUser(uid),
      allowAlert: uid => rateLimit(`new-device-alert:${uid}`, 3, 60 * 60 * 1000),
      // Sem e-mail configurado (prévia, testes): o aviso fica só registrado.
      send: async mail => { if (emailEnabled()) await sendEmail({ ...mail, from: 'noreply' }); },
      appUrl: APP_URL,
    });
  } catch (err) {
    console.error('[trust] aviso de aparelho novo', err);
  }
  res.cookies.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
}
