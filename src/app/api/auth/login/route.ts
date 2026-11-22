import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { checkRecaptchaScore } from '@/lib/recaptcha';
import { adminDb } from '@/lib/firebase/admin';
import { generateActionToken } from '@/lib/auth-token';
import { sendEmail } from '@/lib/email';
import { loginChallengeEmail } from '@/lib/email/loginChallengeEmail';
import { deviceLabel } from '@/lib/passkeys';
import { requestPlace } from '@/lib/requestPlace';
import { passwordLeaked } from '@/lib/leakedCredentials';
import { HONEY_LOGIN_EMAILS, triggerHoneytoken } from '@/lib/honeytoken';
import { checkPasswordServerSide } from '@/lib/auth/passwordCheck';
import { hashTicket, issueLoginTicket } from '@/lib/auth/loginTicket';

const schema = z.object({
  email: z.string().email().max(256),
  password: z.string().min(1).max(256),
  recaptchaToken: z.string().min(1).optional(),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mikma.com.br';

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
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

    const { email, password, recaptchaToken } = parsed.data;
    const emailLower = email.toLowerCase();
    // Isca: e-mail de administrador que não existe. Responde como senha
    // errada e avisa a equipe (ver lib/honeytoken.ts).
    if (HONEY_LOGIN_EMAILS.has(emailLower)) {
      await triggerHoneytoken({ kind: 'login-isca', ip, userAgent: req.headers.get('user-agent'), detail: emailLower, country: req.headers.get('cf-ipcountry') });
      return NextResponse.json({ error: 'E-mail ou senha incorretos.' }, { status: 400 });
    }
    // Por IP + e-mail: só o e-mail deixava qualquer pessoa travar o login
    // de outra (8 tentativas erradas com o e-mail dela). O limite por IP
    // acima continua segurando força bruta.
    const emailKey = `login:email:${ip}:${emailLower}`;
    if (!await rateLimit(emailKey, 8, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 });
    }

    let outcome = await checkRecaptchaScore(recaptchaToken, 'login');
    // Senha que já apareceu em vazamento público (a Cloudflare compara e
    // manda o header; ver infra-manutencao.yml): mesmo com reCAPTCHA bom,
    // pede a confirmação por e-mail. Quem só tem a senha vazada não entra.
    const leaked = passwordLeaked(req.headers.get('exposed-credential-check'));
    if (outcome === 'pass' && leaked) outcome = 'challenge';

    if (outcome === 'block') {
      return NextResponse.json(
        { error: 'Verificação de segurança falhou. Recarregue a página e tente novamente.' },
        { status: 400 }
      );
    }

    if (outcome === 'pass') {
      // A senha é conferida aqui também: o ticket só sai para a senha certa
      // que passou pelo reCAPTCHA e não apareceu em vazamento. Sem isso,
      // dava para tirar o ticket com uma senha qualquer e entrar com a
      // vazada direto no Firebase (ver lib/auth/loginTicket.ts).
      const check = await checkPasswordServerSide(emailLower, password);
      if (check === 'wrong') return NextResponse.json({ error: 'E-mail ou senha incorretos.' }, { status: 400 });
      // Sem conferir agora (rede, conta desativada): o login segue no
      // navegador, sem ticket; CPF e apagar a conta pedem para entrar de novo.
      // O ticket vai só para este navegador (ver lib/auth/loginTicket.ts).
      const ticket = check === 'ok'
        ? await issueLoginTicket(adminDb, emailLower).catch(err => { console.error('[login] ticket', err); return undefined; })
        : undefined;
      // Sem ticket, CPF e conta pedem para entrar de novo: a equipe precisa saber.
      if (check === 'unavailable') Sentry.captureMessage('Login sem ticket: o servidor não conseguiu conferir a senha no Firebase', 'warning');
      return NextResponse.json(ticket ? { ok: true, ticket } : { ok: true });
    }

    // outcome === 'challenge': score suspeito, mas não claramente bot.
    // Confirma a senha antes de mandar e-mail (evita mandar pra caixa de
    // entrada de estranho só porque alguem digitou o e-mail errado).
    const challengeKey = `login-challenge:email:${emailLower}`;
    if (!await rateLimit(challengeKey, 3, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Muitas tentativas de confirmação. Aguarde alguns minutos.' },
        { status: 429 }
      );
    }

    const check = await checkPasswordServerSide(emailLower, password);
    if (check === 'unavailable') {
      return NextResponse.json({ error: 'Não foi possível conferir agora. Tente de novo em alguns minutos.' }, { status: 503 });
    }
    if (check === 'wrong') {
      // Mesma mensagem genérica de sempre, não revela se foi a senha ou
      // o e-mail que estava errado.
      return NextResponse.json({ error: 'E-mail ou senha incorretos.' }, { status: 400 });
    }

    const token = generateActionToken();
    // Id do desafio: só esta aba recebe. Consulta o andamento com ele e, depois
    // da confirmação, ele vira o ticket do login (quem só tem a senha não sabe
    // quando a dona da conta confirmou, nem tem o ticket).
    const challenge = generateActionToken();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min

    await adminDb.collection('login_challenges').doc(emailLower).set({
      email: emailLower,
      token,
      challengeHash: hashTicket(challenge),
      expiresAt,
      attempts: 0,
      confirmed: false,
      ip,
      createdAt: new Date().toISOString(),
    });

    // A página do link pede o clique em "Sim, fui eu" ou "Não fui eu": abrir
    // o link não confirma nada (antivírus de e-mail abre links sozinho).
    const confirmUrl = `${APP_URL}/confirmar-login?email=${encodeURIComponent(emailLower)}&token=${token}`;
    const mail = loginChallengeEmail({
      confirmUrl,
      denyUrl: `${confirmUrl}&acao=negar`,
      when: new Date(),
      device: deviceLabel(req.headers.get('user-agent')),
      place: requestPlace(req.headers),
      ip,
      leaked,
    });

    try {
      await sendEmail({ to: emailLower, subject: mail.subject, text: mail.text, html: mail.html, from: 'noreply' });
    } catch (err) {
      console.error('[login] falha ao enviar e-mail de confirmação', err);
      return NextResponse.json({ error: 'Não conseguimos enviar o e-mail de confirmação. Tente novamente.' }, { status: 500 });
    }

    return NextResponse.json({ ok: false, requiresEmailChallenge: true, email: emailLower, challenge });
  } catch {
    return NextResponse.json({ error: 'Não foi possível concluir agora. Tente de novo.' }, { status: 500 });
  }
}
