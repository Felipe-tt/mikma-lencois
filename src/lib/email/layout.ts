import { escapeHtml } from '@/lib/html';
import { formatCurrency } from '@/lib/utils/format';
import { SIZE_LABEL } from '@/lib/productOptions';

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

// Cores de texto com contraste AA (≥4,5:1) sobre o creme e o branco: os
// cinzas antigos (#9C8B7C, #B09C8C) ficavam em 2,3 a 3,3:1.
const MUTED = '#705A48';
const SOFT = '#7A6656';
const LINK = '#9A4A28';

interface LayoutOptions {
  /** Texto pequeno extra no rodapé (ex: aviso de e-mail automático nos e-mails de conta). */
  footerNote?: string;
  /** Rodapé convida a responder (e-mails de pedido têm replyTo pro contato). */
  replyHint?: boolean;
  /**
   * Prévia que a caixa de entrada mostra ao lado do assunto. Sem ela o
   * Gmail mostrava "Mikma Lençóis BLUMENAU, SC PEDIDO #…".
   */
  preheader?: string;
}

export function emailLayout(body: string, { footerNote, replyHint = true, preheader }: LayoutOptions = {}): string {
  // Espaços invisíveis depois da prévia: impedem o cliente de completar a
  // linha com o começo do corpo do e-mail.
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F5F0EB;opacity:0;">${escapeHtml(preheader)}${'&#8199;&#65279;&#847; '.repeat(40)}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${STORE_NAME}</title></head>
<body style="margin:0;padding:0;background:#F5F0EB;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
${preheaderHtml}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0EB;padding:32px 12px;">
<tr><td align="center">
<table width="100%" style="max-width:600px;">

  <tr><td style="padding:0 4px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><a href="${BASE_URL}" style="text-decoration:none;"><img src="${BASE_URL}/logo-dark.png" width="132" height="40" alt="${STORE_NAME}" style="display:block;border:0;width:132px;height:40px;font-family:Georgia,serif;font-size:22px;color:#1E1208;"/></a></td>
      <td align="right"><span style="font-size:11px;color:${MUTED};letter-spacing:.12em;text-transform:uppercase;">Blumenau, SC</span></td>
    </tr></table>
  </td></tr>

  <tr><td style="background:#fff;border-top:3px solid #C4714A;border-radius:0 0 16px 16px;">${body}</td></tr>

  <tr><td style="padding:22px 4px 0;">
    <p style="margin:0;font-size:12px;color:${MUTED};text-align:center;line-height:1.7;">
      ${replyHint ? 'Dúvidas? Responda este e-mail ou escreva para ' : 'Dúvidas? Escreva para '}<a href="mailto:${CONTACT_EMAIL}" style="color:${LINK};text-decoration:none;">${CONTACT_EMAIL}</a>
      &nbsp;·&nbsp;<a href="${BASE_URL}" style="color:${LINK};text-decoration:none;">mikma.com.br</a>
      ${footerNote ? `<br><span style="color:${MUTED};">${footerNote}</span>` : ''}
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
    ${eyebrow ? `<p style="margin:0 0 4px;font-size:12px;color:${SOFT};letter-spacing:.08em;text-transform:uppercase;">${eyebrow}</p>` : ''}
    <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:26px;font-weight:normal;color:#1E1208;line-height:1.2;">${title}</h1>
    ${html}
  </div>`;
}

export function emailParagraph(html: string, { muted = false }: { muted?: boolean } = {}): string {
  return `<p style="margin:0 0 14px;font-size:${muted ? 14 : 15}px;color:${muted ? '#705A48' : '#2C1F14'};line-height:1.7;">${html}</p>`;
}

/** Botão principal em tinta escura (o terracota com texto branco ficava em 3,6:1). */
export function emailCta(label: string, url: string, { secondary = false }: { secondary?: boolean } = {}): string {
  if (secondary) {
    return `<table cellpadding="0" cellspacing="0" style="margin:10px 0 8px;">
    <tr><td style="border:1px solid #1E1208;border-radius:999px;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:bold;color:#1E1208;text-decoration:none;letter-spacing:.02em;">${label}</a>
    </td></tr>
  </table>`;
  }
  return `<table cellpadding="0" cellspacing="0" style="margin:22px 0 8px;">
    <tr><td style="background:#1E1208;border-radius:999px;">
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
    <p style="margin:0;font-size:12px;color:${MUTED};line-height:1.6;">
      <strong style="color:#1E1208;">${STORE_NAME}</strong> · Lençóis direto da fábrica
    </p>
  </div>`;
}

export interface EmailItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  variant?: { size?: string; color?: string; colorName?: string; fabric?: string };
}

/** Valores do pedido gravados em create-pix/create-checkout (todos opcionais em pedidos antigos). */
export interface EmailMoney {
  productsCents?: number;
  shippingCents?: number;
  pixDiscountCents?: number;
  couponDiscountCents?: number;
  discountCents?: number;
  couponCode?: string;
}

export interface EmailOrderTotals extends EmailMoney {
  items: EmailItem[];
  totalCents: number;
}

/** "Casal · Terracota · Percal": tamanho legível, nome da cor (nunca o hex) e tecido com maiúscula. */
export function itemMeta(v: EmailItem['variant']): string {
  if (!v) return '';
  const fabric = v.fabric ? v.fabric.charAt(0).toUpperCase() + v.fabric.slice(1) : undefined;
  return [v.size ? (SIZE_LABEL[v.size] ?? v.size) : undefined, v.colorName, fabric]
    .filter(Boolean).map(x => escapeHtml(String(x))).join(' · ');
}

/**
 * Linhas da conta (Subtotal, Frete, descontos) que fecham com o Total, igual
 * à página do pedido. Antes a tabela listava os itens e um Total com o frete
 * embutido, e a soma não batia. Em pedido sem os valores separados, a
 * diferença entra como frete (se positiva) ou desconto (se negativa).
 */
export function orderTotalsRows(order: EmailOrderTotals): { label: string; cents: number; free?: boolean; discount?: boolean }[] {
  const products = order.productsCents ?? order.items.reduce((t, i) => t + i.unitPrice * i.quantity, 0);
  const rows: { label: string; cents: number; free?: boolean; discount?: boolean }[] = [{ label: 'Subtotal', cents: products }];
  const known = order.shippingCents !== undefined || order.discountCents !== undefined
    || order.pixDiscountCents !== undefined || order.couponDiscountCents !== undefined;
  if (!known) {
    const diff = order.totalCents - products;
    if (diff > 0) rows.push({ label: 'Frete', cents: diff });
    else if (diff < 0) rows.push({ label: 'Descontos', cents: -diff, discount: true });
    else rows.push({ label: 'Frete', cents: 0, free: true });
    return rows;
  }
  const discount = order.discountCents ?? ((order.pixDiscountCents ?? 0) + (order.couponDiscountCents ?? 0));
  const shipping = order.shippingCents ?? Math.max(0, order.totalCents - products + discount);
  rows.push(shipping === 0 ? { label: 'Frete', cents: 0, free: true } : { label: 'Frete', cents: shipping });
  const pix = order.pixDiscountCents ?? 0;
  const coupon = order.couponDiscountCents ?? Math.max(0, discount - pix);
  if (pix > 0) rows.push({ label: 'Desconto no PIX', cents: pix, discount: true });
  if (coupon > 0) rows.push({ label: order.couponCode ? `Cupom ${order.couponCode}` : 'Cupom', cents: coupon, discount: true });
  return rows;
}

export function emailItemsTable(order: EmailOrderTotals): string {
  const rows = order.items.map(it => {
    const meta = itemMeta(it.variant);
    return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #F0EBE1;font-size:13px;color:#1E1208;">
        ${escapeHtml(it.productName)}<br>
        <span style="font-size:12px;color:${MUTED};">${meta ? `${meta} · ` : ''}${it.quantity}x</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #F0EBE1;font-size:13px;color:#1E1208;text-align:right;white-space:nowrap;vertical-align:top;">
        ${formatCurrency(it.unitPrice * it.quantity)}
      </td>
    </tr>`;
  }).join('');
  const totals = orderTotalsRows(order).map((r, i) => `
    <tr>
      <td style="padding:${i === 0 ? 12 : 4}px 0 0;font-size:13px;color:${r.discount ? '#2F6B3F' : MUTED};">${escapeHtml(r.label)}</td>
      <td style="padding:${i === 0 ? 12 : 4}px 0 0;font-size:13px;color:${r.discount ? '#2F6B3F' : MUTED};text-align:right;white-space:nowrap;">${r.free ? 'Grátis' : `${r.discount ? '− ' : ''}${formatCurrency(r.cents)}`}</td>
    </tr>`).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">
    ${rows}
    ${totals}
    <tr>
      <td style="padding:10px 0 0;border-top:1px solid #F0EBE1;font-size:15px;font-weight:bold;color:#1E1208;">Total</td>
      <td style="padding:10px 0 0;border-top:1px solid #F0EBE1;font-size:15px;font-weight:bold;color:#1E1208;text-align:right;white-space:nowrap;">${formatCurrency(order.totalCents)}</td>
    </tr>
  </table>`;
}
