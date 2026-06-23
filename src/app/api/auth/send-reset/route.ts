export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { sendEmail } from '@/lib/email';
import { randomInt } from 'crypto';

const schema = z.object({
  email: z.string().email().max(256).toLowerCase(),
});

// Resposta sempre igual — não revela se e-mail existe
const OK = NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  const ipKey = `send-reset:ip:${ip}`;
  if (!rateLimit(ipKey, 3, 15 * 60 * 1000)) {
    const wait = Math.ceil(rateLimitRetryAfter(ipKey) / 60000);
    return NextResponse.json({ error: `Aguarde ${wait} minuto(s) antes de tentar novamente.` }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return OK; // não revela erro

  const { email } = parsed.data;

  const emailKey = `send-reset:email:${email}`;
  if (!rateLimit(emailKey, 3, 15 * 60 * 1000)) return OK; // silencioso

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

  const code = String(randomInt(100000, 999999));
  const expiresAt = Date.now() + 15 * 60 * 1000;

  await adminDb.collection('password_resets').doc(email).set({
    email, code, expiresAt, attempts: 0, ip,
    createdAt: new Date().toISOString(),
  });

  const html = `
<!DOCTYPE html><html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border:1px solid #E6DFD5;">
        <tr><td style="background:#1E1208;padding:32px;text-align:center;">
          <p style="margin:0;color:#FAF8F5;font-size:22px;font-style:italic;letter-spacing:1px;">Mikma Lençóis</p>
        </td></tr>
        <tr><td style="padding:40px 36px;">
          <p style="margin:0 0 8px;font-size:18px;color:#1E1208;font-weight:bold;">Olá, ${firstName}!</p>
          <p style="margin:0 0 28px;font-size:15px;color:#705A48;line-height:1.6;">
            Recebemos um pedido para redefinir a senha da sua conta.<br>Seu código é:
          </p>
          <div style="background:#FAF8F5;border:2px dashed #C4714A;border-radius:4px;padding:28px;text-align:center;margin:0 0 28px;">
            <p style="margin:0 0 6px;font-size:13px;color:#B09C8C;letter-spacing:2px;text-transform:uppercase;">Código de redefinição</p>
            <p style="margin:0;font-size:48px;font-weight:bold;color:#1E1208;letter-spacing:10px;">${code}</p>
            <p style="margin:8px 0 0;font-size:12px;color:#B09C8C;">Válido por 15 minutos</p>
          </div>
          <p style="margin:0 0 24px;font-size:14px;color:#705A48;line-height:1.6;">
            Digite esse código na tela de redefinição de senha para criar uma nova senha.
          </p>
          <div style="background:#FFF8F0;border-left:3px solid #C4714A;padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#705A48;">
              <strong>Não pediu isso?</strong> Ignore este e-mail. Sua senha continua a mesma.
            </p>
          </div>
        </td></tr>
        <tr><td style="background:#FAF8F5;border-top:1px solid #E6DFD5;padding:20px 36px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#B09C8C;">Mikma Lençóis · Blumenau, SC</p>
          <p style="margin:4px 0 0;font-size:11px;color:#C8BAB0;">Este é um e-mail automático — não responda.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    await sendEmail({
      to: email,
      subject: `${code} — código para redefinir sua senha na Mikma Lençóis`,
      text: `Olá, ${firstName}!\n\nSeu código para redefinir a senha é: ${code}\n\nVálido por 15 minutos.\n\nSe não pediu isso, ignore este e-mail.\n\nMikma Lençóis`,
      html,
      from: 'noreply',
    });
  } catch (err) {
    console.error('[send-reset]', err);
    return NextResponse.json({ error: 'Não conseguimos enviar o e-mail. Tente novamente.' }, { status: 500 });
  }

  return OK;
}
