export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { sendEmail } from '@/lib/email';
import { generateActionToken } from '@/lib/auth-token';
import { actionButtonEmailHtml } from '@/lib/email-templates';

const schema = z.object({
  email: z.string().email().max(256).toLowerCase(),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mikma.com.br';

// Resposta sempre igual — não revela se e-mail existe
const OK = NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  const ipKey = `send-reset:ip:${ip}`;
  if (!await rateLimit(ipKey, 3, 15 * 60 * 1000)) {
    const wait = Math.ceil(rateLimitRetryAfter(ipKey) / 60000);
    return NextResponse.json({ error: `Aguarde ${wait} minuto(s) antes de tentar novamente.` }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return OK; // não revela erro

  const { email } = parsed.data;

  const emailKey = `send-reset:email:${email}`;
  if (!await rateLimit(emailKey, 3, 15 * 60 * 1000)) return OK; // silencioso

  // Verifica se e-mail existe — mas responde igual de qualquer forma
  let firstName = 'você';
  try {
    const user = await adminAuth.getUserByEmail(email);
    if (user.disabled) return OK;
    firstName = (user.displayName || '').split(' ')[0] || 'você';
  } catch {
    // não existe — retorna OK mesmo assim (não revela)
    return OK;
  }

  const token = generateActionToken();
  const expiresAt = Date.now() + 15 * 60 * 1000;

  await adminDb.collection('password_resets').doc(email).set({
    email, token, expiresAt, attempts: 0, ip,
    createdAt: new Date().toISOString(),
  });

  const actionUrl = `${APP_URL}/redefinir-senha?email=${encodeURIComponent(email)}&token=${token}`;

  const html = actionButtonEmailHtml({
    greetingName: firstName,
    introText: 'Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:',
    buttonLabel: 'Criar nova senha',
    actionUrl,
    expiryNote: 'Este link é válido por 15 minutos.',
    securityNote: '<strong>Não pediu isso?</strong> Ignore este e-mail. Sua senha continua a mesma.',
  });

  try {
    await sendEmail({
      to: email,
      subject: 'Redefinir sua senha — Mikma Lençóis',
      text: `Olá, ${firstName}!\n\nRecebemos um pedido para redefinir a senha da sua conta.\n\nClique no link abaixo para criar uma nova senha (válido por 15 minutos):\n${actionUrl}\n\nSe não pediu isso, ignore este e-mail.\n\nMikma Lençóis`,
      html,
      from: 'noreply',
    });
  } catch (err) {
    console.error('[send-reset]', err);
    return NextResponse.json({ error: 'Não conseguimos enviar o e-mail. Tente novamente.' }, { status: 500 });
  }

  return OK;
}
