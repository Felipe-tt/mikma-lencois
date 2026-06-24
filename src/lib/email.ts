import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY não configurada');
    _resend = new Resend(key);
  }
  return _resend;
}

const STORE_NAME = 'Mikma Lençóis';
const NOREPLY_ADDRESS = process.env.RESEND_FROM_EMAIL || 'noreply@mikma.com.br';
const CONTATO_ADDRESS = process.env.EMAIL_CONTATO_ADDRESS || 'contato@mikma.com.br';

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** 'contato' usa o remetente de suporte (para respostas de conversa); 'noreply' para avisos automáticos. */
  from?: 'noreply' | 'contato';
  replyTo?: string;
}

/**
 * Gera um HTML bonito e responsivo para respostas da loja ao cliente.
 * Funciona em Gmail, Outlook, Apple Mail e clientes mobile.
 */
export function buildReplyHtml(text: string, storeName = STORE_NAME): string {
  // Converte quebras de linha em <br> e preserva parágrafos
  const bodyHtml = text
    .split(/\n\n+/)
    .map(para => `<p style="margin:0 0 16px;line-height:1.65;">${para.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${storeName}</title>
</head>
<body style="margin:0;padding:0;background:#F5F0EB;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0EB;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:580px;">

          <!-- Logo / header -->
          <tr>
            <td style="padding:0 0 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:normal;color:#1E1208;letter-spacing:0.04em;">
                      ${storeName}
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size:11px;color:#9C8B7C;letter-spacing:0.12em;text-transform:uppercase;">
                      Blumenau, SC
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td style="background:#FFFFFF;padding:36px 36px 28px;border-top:3px solid #C4714A;">
              <div style="font-size:15px;color:#2C1F14;line-height:1.65;">
                ${bodyHtml}
              </div>
            </td>
          </tr>

          <!-- Assinatura -->
          <tr>
            <td style="background:#FFFFFF;padding:0 36px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border-top:1px solid #EDE6DC;padding-top:20px;margin-top:4px;">
                <tr>
                  <td>
                    <p style="margin:0;font-size:13px;color:#705A48;line-height:1.5;">
                      <strong style="color:#1E1208;">${storeName}</strong><br>
                      contato@mikma.com.br<br>
                      <a href="https://mikma.com.br" style="color:#C4714A;text-decoration:none;">mikma.com.br</a>
                    </p>
                  </td>
                  <td align="right" valign="top">
                    <span style="font-family:Georgia,serif;font-size:28px;color:#E6DFD5;font-style:italic;">M</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0 0;">
              <p style="margin:0;font-size:11px;color:#B09C8C;text-align:center;line-height:1.6;">
                Você está recebendo esta mensagem porque entrou em contato com ${storeName}.<br>
                Para responder, basta responder a este e-mail diretamente.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Envia um e-mail via Resend. Lança erro se a API key não estiver configurada ou o envio falhar. */
export async function sendEmail({ to, subject, text, html, from = 'noreply', replyTo }: SendEmailInput) {
  const resend = getResend();

  // Se não vier HTML customizado, gera o template padrão bonito
  const finalHtml = html ?? buildReplyHtml(text);

  const { data, error } = await resend.emails.send({
    from: from === 'contato' ? `${STORE_NAME} <${CONTATO_ADDRESS}>` : `${STORE_NAME} <${NOREPLY_ADDRESS}>`,
    to,
    subject,
    text,
    html: finalHtml,
    ...(replyTo ? { replyTo } : {}),
  });
  if (error) throw new Error(error.message);
  return data;
}

/** true se o envio de e-mail estiver configurado (evita erros em ambientes sem a env var, ex: preview). */
export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
