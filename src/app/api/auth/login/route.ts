export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { checkRecaptchaScore } from '@/lib/recaptcha';
import { adminDb } from '@/lib/firebase/admin';
import { generateActionToken } from '@/lib/auth-token';
import { sendEmail } from '@/lib/email';
import { actionButtonEmailHtml } from '@/lib/email-templates';

const schema = z.object({
  email: z.string().email().max(256),
  password: z.string().min(1).max(256),
  recaptchaToken: z.string().min(1).optional(),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mikma.com.br';
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

/**
 * Confirma a senha direto na API REST do Identity Toolkit (o mesmo
 * endpoint que o SDK do cliente usa por baixo dos panos pra
 * signInWithEmailAndPassword). Só precisa da API key pública, sem
 * nenhuma permissão IAM especial — diferente de createCustomToken, que
 * este projeto evita de propósito (ver reset-password/route.ts).
 *
 * Usado só no caso "challenge": precisamos confirmar que é a senha
 * certa ANTES de mandar e-mail de verificação, senão qualquer um digita
 * um e-mail alheio com senha errada e a gente manda e-mail pra caixa de
 * entrada de estranho (spam/enumeração).
 */
async function verifyPasswordServerSide(email: string, password: string): Promise<boolean> {
  if (!FIREBASE_API_KEY) return false;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
        signal: AbortSignal.timeout(8000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

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
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

    const { email, password, recaptchaToken } = parsed.data;
    const emailLower = email.toLowerCase();
    const emailKey = `login:email:${emailLower}`;
    if (!await rateLimit(emailKey, 8, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 });
    }

    const outcome = await checkRecaptchaScore(recaptchaToken, 'login');

    if (outcome === 'block') {
      return NextResponse.json(
        { error: 'Verificação de segurança falhou. Recarregue a página e tente novamente.' },
        { status: 400 }
      );
    }

    if (outcome === 'pass') {
      // Rate limit e reCAPTCHA ok, o Firebase Auth no cliente faz a validação real da senha
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

    const passwordOk = await verifyPasswordServerSide(emailLower, password);
    if (!passwordOk) {
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
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
