import { Resend } from 'resend';
import { escapeHtml } from '@/lib/html';
import { emailLayout, emailParagraph, emailSignature } from '@/lib/email/layout';

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
 * HTML das respostas da loja ao cliente (conversas do painel). Usa o mesmo
 * layout dos e-mails de pedido; antes era um terceiro modelo, de 580px, com
 * cores de rodapé sem contraste.
 */
export function buildReplyHtml(text: string): string {
  // Escapa antes: "<", "&" ou "<nome do cupom>" no texto quebravam o e-mail.
  const bodyHtml = text
    .split(/\n\n+/)
    .map(para => emailParagraph(escapeHtml(para).replace(/\n/g, '<br>')))
    .join('');
  const preview = text.replace(/\s+/g, ' ').trim().slice(0, 110);
  return emailLayout(`
    <div style="padding:32px 28px 8px;">${bodyHtml}</div>
    ${emailSignature()}`, { preheader: preview });
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
