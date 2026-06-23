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

/** Envia um e-mail via Resend. Lança erro se a API key não estiver configurada ou o envio falhar. */
export async function sendEmail({ to, subject, text, html, from = 'noreply', replyTo }: SendEmailInput) {
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: from === 'contato' ? `${STORE_NAME} <${CONTATO_ADDRESS}>` : `${STORE_NAME} <${NOREPLY_ADDRESS}>`,
    to,
    subject,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
  });
  if (error) throw new Error(error.message);
  return data;
}

/** true se o envio de e-mail estiver configurado (evita erros em ambientes sem a env var, ex: preview). */
export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
