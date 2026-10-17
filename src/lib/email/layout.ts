import { escapeHtml } from '@/lib/html';
import { formatCurrency } from '@/lib/utils/format';

/**
 * Layout único dos e-mails pro cliente. Antes havia três (cabeçalho claro de
 * 600px, cabeçalho marrom de 480px em Georgia e um terceiro solto no
 * webhook) e cada e-mail parecia de uma loja diferente.
 */

export const STORE_NAME = 'Mikma Lençóis';
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://mikma.com.br';
/** Endereço que recebe as respostas dos clientes (replyTo dos e-mails de pedido). */
export const CONTACT_EMAIL = process.env.EMAIL_CONTATO_ADDRESS || 'contato@mikma.com.br';

/** "Pedido #AB12CD34 confirmado | Mikma Lençóis" (antes: ", Mikma Lençóis", que lia como vocativo). */
export function orderSubject(shortId: string, what: string): string {
  return `Pedido #${shortId} ${what} | ${STORE_NAME}`;
}

export function shortOrderId(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

interface LayoutOptions {
  /** Texto pequeno extra no rodapé (ex: aviso de e-mail automático nos e-mails de conta). */
  footerNote?: string;
  /** Rodapé convida a responder (e-mails de pedido têm replyTo pro contato). */
  replyHint?: boolean;
}

export function emailLayout(body: string, { footerNote, replyHint = true }: LayoutOptions = {}): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${STORE_NAME}</title></head>
<body style="margin:0;padding:0;background:#F5F0EB;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0EB;padding:32px 12px;">
<tr><td align="center">
<table width="100%" style="max-width:600px;">

  <tr><td style="padding:0 4px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><span style="font-family:Georgia,serif;font-size:22px;color:#1E1208;letter-spacing:.04em;">${STORE_NAME}</span></td>
      <td align="right"><span style="font-size:11px;color:#9C8B7C;letter-spacing:.12em;text-transform:uppercase;">Blumenau, SC</span></td>
    </tr></table>
  </td></tr>

  <tr><td style="background:#fff;border-top:3px solid #C4714A;border-radius:0 0 16px 16px;">${body}</td></tr>

  <tr><td style="padding:22px 4px 0;">
    <p style="margin:0;font-size:11px;color:#9C8B7C;text-align:center;line-height:1.7;">
      ${replyHint ? 'Dúvidas? Responda este e-mail ou escreva para ' : 'Dúvidas? Escreva para '}<a href="mailto:${CONTACT_EMAIL}" style="color:#B45A34;text-decoration:none;">${CONTACT_EMAIL}</a>
      &nbsp;·&nbsp;<a href="${BASE_URL}" style="color:#B45A34;text-decoration:none;">mikma.com.br</a>
      ${footerNote ? `<br><span style="color:#B09C8C;">${footerNote}</span>` : ''}
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Bloco de conteúdo com o "eyebrow" (ex: Pedido #X), título e parágrafos. */
export function emailSection({ eyebrow, title, html }: { eyebrow?: string; title: string; html: string }): string {
  return `<div style="padding:32px 28px 8px;">
    ${eyebrow ? `<p style="margin:0 0 4px;font-size:12px;color:#9C8B7C;letter-spacing:.08em;text-transform:uppercase;">${eyebrow}</p>` : ''}
    <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:26px;font-weight:normal;color:#1E1208;line-height:1.2;">${title}</h1>
    ${html}
  </div>`;
}

export function emailParagraph(html: string, { muted = false }: { muted?: boolean } = {}): string {
  return `<p style="margin:0 0 14px;font-size:${muted ? 14 : 15}px;color:${muted ? '#705A48' : '#2C1F14'};line-height:1.7;">${html}</p>`;
}

export function emailCta(label: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:22px 0 8px;">
    <tr><td style="background:#C4714A;border-radius:999px;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:bold;color:#fff;text-decoration:none;letter-spacing:.02em;">${label}</a>
    </td></tr>
  </table>`;
}

/** Caixa de destaque (código de rastreio, código PIX, aviso). */
export function emailCallout(html: string): string {
  return `<div style="background:#F5F0EB;padding:16px 18px;margin:18px 0;border-left:3px solid #C4714A;border-radius:0 12px 12px 0;">${html}</div>`;
}

export function emailSignature(): string {
  return `<div style="padding:18px 28px 26px;border-top:1px solid #F0EBE1;margin-top:16px;">
    <p style="margin:0;font-size:12px;color:#9C8B7C;line-height:1.6;">
      <strong style="color:#1E1208;">${STORE_NAME}</strong> · Lençóis direto da fábrica
    </p>
  </div>`;
}

interface EmailItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  variant?: { size?: string; color?: string; colorName?: string; fabric?: string };
}

export function emailItemsTable(items: EmailItem[], totalCents: number): string {
  const rows = items.map(it => {
    const v = it.variant;
    const meta = v ? [v.size, v.colorName || v.color, v.fabric].filter(Boolean).map(x => escapeHtml(String(x))).join(' · ') : '';
    return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #F0EBE1;font-size:13px;color:#1E1208;">
        ${escapeHtml(it.productName)}<br>
        <span style="font-size:11px;color:#9C8B7C;">${meta ? `${meta} · ` : ''}${it.quantity}x</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #F0EBE1;font-size:13px;color:#1E1208;text-align:right;white-space:nowrap;">
        ${formatCurrency(it.unitPrice * it.quantity)}
      </td>
    </tr>`;
  }).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">
    ${rows}
    <tr>
      <td style="padding:12px 0 0;font-size:14px;font-weight:bold;color:#1E1208;">Total</td>
      <td style="padding:12px 0 0;font-size:14px;font-weight:bold;color:#1E1208;text-align:right;">${formatCurrency(totalCents)}</td>
    </tr>
  </table>`;
}
