import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { checkRecaptchaScore } from '@/lib/recaptcha';
import { adminDb } from '@/lib/firebase/admin';
import { generateActionToken } from '@/lib/auth-token';
import { sendEmail } from '@/lib/email';
import { actionButtonEmailHtml } from '@/lib/email-templates';
import { passwordLeaked } from '@/lib/leakedCredentials';
import { HONEY_LOGIN_EMAILS, triggerHoneytoken } from '@/lib/honeytoken';
import { checkPasswordServerSide } from '@/lib/auth/passwordCheck';
import { issueLoginTicket } from '@/lib/auth/loginTicket';

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
    if (outcome === 'pass' && passwordLeaked(req.headers.get('exposed-credential-check'))) outcome = 'challenge';

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
      if (check === 'ok') await issueLoginTicket(adminDb, emailLower).catch(err => console.error('[login] ticket', err));
      // Sem ticket, CPF e conta pedem para entrar de novo: a equipe precisa saber.
      else if (check === 'unavailable') Sentry.captureMessage('Login sem ticket: o servidor não conseguiu conferir a senha no Firebase', 'warning');
      return NextResponse.json({ ok: true });
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
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min

    await adminDb.collection('login_challenges').doc(emailLower).set({
      email: emailLower,
      token,
      expiresAt,
      attempts: 0,
      confirmed: false,
      ip,
      createdAt: new Date().toISOString(),
    });

    const actionUrl = `${APP_URL}/confirmar-login?email=${encodeURIComponent(emailLower)}&token=${token}`;
    const firstName = emailLower.split('@')[0];

    const html = actionButtonEmailHtml({
      greetingName: firstName,
      introText: `Detectamos algo diferente do normal neste login na <strong>Mikma Lençóis</strong>. Pra continuar, confirme clicando no botão abaixo:`,
      buttonLabel: 'Confirmar login',
      actionUrl,
      expiryNote: 'Este link é válido por 10 minutos. A tela onde você digitou a senha vai continuar sozinha assim que você confirmar.',
      securityNote: '<strong>Não foi você?</strong> Ignore este e-mail — sem clicar no link, ninguém entra na sua conta.',
    });

    try {
      await sendEmail({
        to: emailLower,
        subject: 'Confirme seu login, Mikma Lençóis',
        text: `Detectamos algo diferente do normal neste login.\n\nClique no link abaixo para confirmar (válido por 10 minutos):\n${actionUrl}\n\nSe não foi você, ignore este e-mail.\n\nMikma Lençóis`,
        html,
        from: 'noreply',
      });
    } catch (err) {
      console.error('[login] falha ao enviar e-mail de confirmação', err);
      return NextResponse.json({ error: 'Não conseguimos enviar o e-mail de confirmação. Tente novamente.' }, { status: 500 });
    }

    return NextResponse.json({ ok: false, requiresEmailChallenge: true, email: emailLower });
  } catch {
    return NextResponse.json({ error: 'Não foi possível concluir agora. Tente de novo.' }, { status: 500 });
  }
}
