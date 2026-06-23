export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { adminAuth } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { sendEmail } from '@/lib/email';
import { generateActionToken } from '@/lib/auth-token';
import { actionButtonEmailHtml } from '@/lib/email-templates';

const schema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(256).toLowerCase(),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mikma.com.br';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // Rate limit: 3 envios por IP por 15 min
  const ipKey = `send-verify:ip:${ip}`;
  if (!rateLimit(ipKey, 3, 15 * 60 * 1000)) {
    const wait = Math.ceil(rateLimitRetryAfter(ipKey) / 60000);
    return NextResponse.json(
      { error: `Muitas tentativas. Aguarde ${wait} minuto(s).` },
      { status: 429 }
    );
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
  }

  const { name, email } = parsed.data;
  const firstName = name.split(' ')[0];

  // Rate limit por e-mail também
  const emailKey = `send-verify:email:${email}`;
  if (!rateLimit(emailKey, 3, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Já enviamos um link para este e-mail. Aguarde alguns minutos.' },
      { status: 429 }
    );
  }

  // Verifica se e-mail já está cadastrado
  try {
    await adminAuth.getUserByEmail(email);
    // Se chegou aqui, já existe
    return NextResponse.json(
      { error: 'Este e-mail já está cadastrado. Clique em "Entrar" para acessar sua conta.' },
      { status: 409 }
    );
  } catch (e: unknown) {
    // auth/user-not-found = não existe, pode prosseguir
    const code = (e as { errorInfo?: { code?: string } })?.errorInfo?.code;
    if (code !== 'auth/user-not-found') {
      return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
  }

  // Gera token de verificação (substitui o código de 6 dígitos por um
  // link de uso único — sem nada para o usuário digitar).
  const token = generateActionToken();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min

  await adminDb.collection('email_verifications').doc(email).set({
    name,
    email,
    token,
    expiresAt,
    attempts: 0,
    ip,
    createdAt: new Date().toISOString(),
  });

  const actionUrl = `${APP_URL}/confirmar-email?email=${encodeURIComponent(email)}&token=${token}`;

  const html = actionButtonEmailHtml({
    greetingName: `${firstName} 👋`,
    introText: `Você pediu para criar uma conta na <strong>Mikma Lençóis</strong>. Clique no botão abaixo para confirmar que este e-mail é seu:`,
    buttonLabel: 'Confirmar meu e-mail',
    actionUrl,
    expiryNote: 'Este link é válido por 15 minutos.',
    securityNote: '<strong>Não pediu isso?</strong> Pode ignorar este e-mail. Ninguém acessará sua conta sem clicar no link.',
  });

  try {
    await sendEmail({
      to: email,
      subject: 'Confirme seu e-mail — Mikma Lençóis',
      text: `Olá, ${firstName}!\n\nVocê pediu para criar uma conta na Mikma Lençóis.\n\nClique no link abaixo para confirmar seu e-mail (válido por 15 minutos):\n${actionUrl}\n\nSe não pediu isso, ignore este e-mail.\n\nMikma Lençóis`,
      html,
      from: 'noreply',
    });
  } catch (err) {
    console.error('[send-verification]', err);
    return NextResponse.json({ error: 'Não conseguimos enviar o e-mail. Tente novamente.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
