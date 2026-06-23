export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { adminAuth } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { sendEmail } from '@/lib/email';
import { randomInt } from 'crypto';

const schema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(256).toLowerCase(),
});

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
      { error: 'Já enviamos um código para este e-mail. Aguarde alguns minutos.' },
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

  // Gera código de 6 dígitos
  const code = String(randomInt(100000, 999999));
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min

  // Salva no Firestore (coleção temporária)
  await adminDb.collection('email_verifications').doc(email).set({
    name,
    email,
    code,
    expiresAt,
    attempts: 0,
    ip,
    createdAt: new Date().toISOString(),
  });

  // Envia e-mail simples e claro
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border:1px solid #E6DFD5;">
        <!-- Header -->
        <tr><td style="background:#1E1208;padding:32px;text-align:center;">
          <p style="margin:0;color:#FAF8F5;font-size:22px;font-style:italic;letter-spacing:1px;">Mikma Lençóis</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px 36px;">
          <p style="margin:0 0 8px;font-size:18px;color:#1E1208;font-weight:bold;">Olá, ${firstName}! 👋</p>
          <p style="margin:0 0 28px;font-size:15px;color:#705A48;line-height:1.6;">
            Você pediu para criar uma conta na <strong>Mikma Lençóis</strong>.<br>
            Seu código de confirmação é:
          </p>
          <!-- Código grande e claro -->
          <div style="background:#FAF8F5;border:2px dashed #C4714A;border-radius:4px;padding:28px;text-align:center;margin:0 0 28px;">
            <p style="margin:0 0 6px;font-size:13px;color:#B09C8C;letter-spacing:2px;text-transform:uppercase;">Seu código</p>
            <p style="margin:0;font-size:48px;font-weight:bold;color:#1E1208;letter-spacing:10px;">${code}</p>
            <p style="margin:8px 0 0;font-size:12px;color:#B09C8C;">Válido por 15 minutos</p>
          </div>
          <p style="margin:0 0 24px;font-size:14px;color:#705A48;line-height:1.6;">
            Digite esse código na tela de cadastro para confirmar que este e-mail é seu.
          </p>
          <div style="background:#FFF8F0;border-left:3px solid #C4714A;padding:12px 16px;margin:0 0 28px;">
            <p style="margin:0;font-size:13px;color:#705A48;">
              <strong>Não pediu isso?</strong> Pode ignorar este e-mail. Ninguém acessará sua conta sem o código.
            </p>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#FAF8F5;border-top:1px solid #E6DFD5;padding:20px 36px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#B09C8C;">Mikma Lençóis · Blumenau, SC</p>
          <p style="margin:4px 0 0;font-size:11px;color:#C8BAB0;">Este é um e-mail automático — não responda.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await sendEmail({
      to: email,
      subject: `${code} é seu código de confirmação — Mikma Lençóis`,
      text: `Olá, ${firstName}!\n\nSeu código de confirmação é: ${code}\n\nVálido por 15 minutos.\n\nSe não pediu isso, ignore este e-mail.\n\nMikma Lençóis`,
      html,
      from: 'noreply',
    });
  } catch (err) {
    console.error('[send-verification]', err);
    return NextResponse.json({ error: 'Não conseguimos enviar o e-mail. Tente novamente.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
