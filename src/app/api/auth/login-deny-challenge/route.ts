import { plural } from '@/lib/plural';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { generateActionToken } from '@/lib/auth-token';
import { checkChallengeLink, DENY_WINDOW_MS } from '@/lib/auth/loginChallenge';
import { restampAccount } from '@/lib/auth/authStamp';
import { forgetTrustedLogins } from '@/lib/auth/loginTicket';

const schema = z.object({
  email: z.string().email().max(256).toLowerCase(),
  token: z.string().min(20).max(100),
});

/**
 * "Não fui eu", na página do link do e-mail de confirmação de login.
 * Bloqueia a tentativa (a aba que esperava não entra) e, como quem tentou
 * entrar acertou a senha, devolve o link para criar uma nova. Quem tem o
 * link do e-mail tem a caixa de entrada, que é o mesmo que o "esqueci minha
 * senha" pede.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipKey = `login-deny:${ip}`;
  if (!await rateLimit(ipKey, 10, 15 * 60 * 1000)) {
    const wait = Math.ceil(rateLimitRetryAfter(ipKey) / 60000);
    return NextResponse.json({ error: `Muitas tentativas. Aguarde ${plural(wait, 'minuto', 'minutos')}.` }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });

  const { email, token } = parsed.data;
  const link = await checkChallengeLink(adminDb, email, token, { validForMs: DENY_WINDOW_MS });
  if (!link.ok) return link.response;
  const { ref, data } = link;

  await ref.update({ denied: true, deniedAt: new Date().toISOString(), confirmed: false });
  console.warn('[login] tentativa bloqueada pela dona da conta pelo "Não fui eu"');

  const user = await adminAuth.getUserByEmail(email).catch(() => null);
  if (!user || user.disabled) return NextResponse.json({ ok: true });

  // Tinha confirmado sem querer: o ticket ainda não usado sai e as sessões
  // abertas da conta caem, no banco também (a aba pode ter entrado).
  if (data.confirmed === true) {
    if (typeof data.challengeHash === 'string') {
      await adminDb.collection('login_tickets').doc(data.challengeHash).delete().catch(() => {});
    }
    await adminAuth.revokeRefreshTokens(user.uid).catch(err => console.error('[login-deny] revoke', err));
    await forgetTrustedLogins(adminDb, user.uid).catch(err => console.error('[login-deny] logins confiáveis', err));
    await restampAccount(adminDb, adminAuth, user.uid).catch(err => console.error('[login-deny] marca', err));
  }

  // Mesmo formato do "esqueci minha senha" (api/auth/send-reset).
  const resetToken = generateActionToken();
  await adminDb.collection('password_resets').doc(email).set({
    email, token: resetToken, expiresAt: Date.now() + 15 * 60 * 1000, attempts: 0, ip,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, reset: `/redefinir-senha?email=${encodeURIComponent(email)}&token=${resetToken}` });
}
