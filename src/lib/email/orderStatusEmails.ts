import { carrierName, trackingUrl as getTrackingUrl } from '@/lib/carriers';
import { formatCurrency } from '@/lib/utils/format';
import type { Order } from '@/types';
import { escapeHtml } from '@/lib/html';
import {
  BASE_URL, emailCallout, emailCta, emailItemsTable, emailLayout, emailParagraph,
  emailSection, emailSignature, orderSubject, shortOrderId, type EmailItem, type EmailMoney,
} from './layout';

type EmailPayload = { subject: string; html: string; text: string };

/** Mesma conta de dias úteis do checkout ("Recebe sex., 30/10"). */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return d;
}

// Pedido como vem do Firestore: além do tipo Order, carrega os valores
// separados (frete, descontos) que fecham a conta do e-mail.
type OrderDoc = Order & EmailMoney;

function orderUrl(order: Pick<Order, 'id'>) {
  return `${BASE_URL}/pedidos/${order.id}`;
}

export function buildPreparing(order: OrderDoc, name: string): EmailPayload {
  const id = shortOrderId(order.id);
  const url = orderUrl(order);
  const html = emailLayout(`
    ${emailSection({
      eyebrow: `Pedido #${id}`,
      title: 'Pedido em separação',
      html: `
        ${emailParagraph(`Olá, <strong>${escapeHtml(name)}</strong>! Nossa equipe já começou a separar e embalar o seu pedido com todo cuidado.`)}
        ${emailParagraph('Você recebe outro e-mail assim que ele for despachado.', { muted: true })}
        ${emailItemsTable(order)}
        ${emailCta('Acompanhar pedido', url)}`,
    })}
    ${emailSignature()}`, { preheader: 'Já estamos separando e embalando o seu pedido.' });
  return {
    subject: orderSubject(id, 'em separação'),
    html,
    text: `Olá, ${name}! Seu pedido #${id} está sendo separado. Acompanhe em: ${url}`,
  };
}

export function buildShipped(order: OrderDoc, name: string, now = new Date()): EmailPayload {
  const id = shortOrderId(order.id);
  const url = orderUrl(order);
  const code = order.delivery?.trackingCode;
  const carrier = order.delivery?.carrier ?? null;
  const rastreioUrl = carrier && code ? getTrackingUrl(carrier, code) : null;
  const carrierLabel = carrier ? carrierName(carrier) : 'transportadora';
  // Prazo cotado no checkout (dias úteis), contado a partir do despacho.
  const days = order.delivery?.estimatedDays;
  const eta = typeof days === 'number' && days > 0
    ? addBusinessDays(now, days).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
    : null;
  const trackingBlock = code ? emailCallout(`
      <p style="margin:0 0 4px;font-size:11px;color:#7A6656;text-transform:uppercase;letter-spacing:.08em;">Código de rastreio · ${escapeHtml(carrierLabel)}</p>
      <p style="margin:0;font-family:monospace;font-size:18px;font-weight:bold;color:#1E1208;letter-spacing:.12em;">${escapeHtml(code)}</p>
      ${rastreioUrl ? `<p style="margin:8px 0 0;"><a href="${escapeHtml(rastreioUrl)}" style="font-size:13px;color:#9A4A28;text-decoration:none;font-weight:bold;">Rastrear envio →</a></p>` : ''}`) : '';
  const html = emailLayout(`
    ${emailSection({
      eyebrow: `Pedido #${id}`,
      title: 'Pedido despachado',
      html: `
        ${emailParagraph(`Olá, <strong>${escapeHtml(name)}</strong>! Seu pedido saiu e está a caminho.`)}
        ${eta ? emailParagraph(`<strong>Previsão de entrega:</strong> até ${eta}.`, { muted: true }) : ''}
        ${trackingBlock}
        ${emailItemsTable(order)}
        ${emailCta('Acompanhar pedido', url)}`,
    })}
    ${emailSignature()}`, { preheader: eta ? `Seu pedido saiu para entrega. Previsão: até ${eta}.` : 'Seu pedido saiu para entrega.' });
  return {
    subject: orderSubject(id, 'despachado'),
    html,
    text: `Olá, ${name}! Pedido #${id} despachado.${eta ? ` Previsão de entrega: até ${eta}.` : ''}${code ? ` Rastreio: ${code}` : ''} Veja em: ${url}`,
  };
}

export function buildDelivered(order: OrderDoc, name: string): EmailPayload {
  const id = shortOrderId(order.id);
  const url = orderUrl(order);
  // Avaliação é feita na página do produto; com mais de um produto, a lista
  // de pedidos tem um "Avaliar" para cada um.
  const productIds = [...new Set(order.items.map(i => (i as { productId?: string }).productId).filter(Boolean))];
  const reviewUrl = productIds.length === 1 ? `${BASE_URL}/produtos/${productIds[0]}#avaliacoes` : `${BASE_URL}/conta/pedidos`;
  const html = emailLayout(`
    ${emailSection({
      eyebrow: `Pedido #${id}`,
      title: 'Pedido entregue',
      html: `
        ${emailParagraph(`Olá, <strong>${escapeHtml(name)}</strong>! Seu pedido chegou. Esperamos que você ame seus novos lençóis.`)}
        ${emailParagraph('Se algo não estiver certo, é só responder este e-mail que a gente resolve.', { muted: true })}
        ${emailItemsTable(order)}
        ${emailParagraph('Sua avaliação ajuda outras pessoas a escolher e leva menos de um minuto.', { muted: true })}
        ${emailCta('Avaliar minha compra', reviewUrl)}
        ${emailCta('Ver detalhes do pedido', url, { secondary: true })}`,
    })}
    ${emailSignature()}`, { preheader: 'Seu pedido chegou. Conta pra gente o que achou?' });
  return {
    subject: orderSubject(id, 'entregue'),
    html,
    text: `Olá, ${name}! Pedido #${id} entregue. Se algo não estiver certo, responda este e-mail. Avalie sua compra: ${reviewUrl}. Pedido: ${url}`,
  };
}

/** Pagamento confirmado (PIX ou cartão). */
export function buildConfirmed(
  order: { id: string; items: EmailItem[]; totalCents: number; payment: { method: string } } & EmailMoney,
  name: string,
): EmailPayload {
  const id = shortOrderId(order.id);
  const url = orderUrl(order);
  const payMethod = order.payment.method === 'pix' ? 'PIX' : 'cartão de crédito';
  const html = emailLayout(`
    ${emailSection({
      eyebrow: `Pedido #${id}`,
      title: 'Pedido confirmado',
      html: `
        ${emailParagraph(`Olá, <strong>${escapeHtml(name)}</strong>! Recebemos seu pagamento via ${payMethod} e já estamos preparando seu pedido. Obrigado pela compra!`)}
        ${emailItemsTable(order)}
        ${emailCta('Acompanhar pedido', url)}`,
    })}
    ${emailSignature()}`, { preheader: `Pagamento de ${formatCurrency(order.totalCents)} confirmado. Já estamos preparando tudo.` });
  const lines = order.items.map(i => `${i.quantity}x ${i.productName}, ${formatCurrency(i.unitPrice * i.quantity)}`);
  return {
    subject: orderSubject(id, 'confirmado'),
    html,
    text: [
      `Olá, ${name}!`, '',
      `Seu pedido #${id} foi confirmado. Obrigado pela compra!`, '',
      'ITENS:', ...lines, '',
      `Total: ${formatCurrency(order.totalCents)} via ${payMethod}`, '',
      `Acompanhe seu pedido: ${url}`, '',
      'Qualquer dúvida, responda este e-mail.',
      'Equipe Mikma Lençóis',
    ].join('\n'),
  };
}

/** Pedido criado com PIX gerado, falta pagar. */
export function buildPixPending(
  order: { id: string; items: EmailItem[]; totalCents: number } & EmailMoney,
  name: string,
  pix: { copyPaste: string; expiresAt?: string | Date | null },
): EmailPayload {
  const id = shortOrderId(order.id);
  const url = orderUrl(order);
  const exp = pix.expiresAt ? new Date(pix.expiresAt) : null;
  const expLabel = exp && !Number.isNaN(exp.getTime())
    ? exp.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;
  const html = emailLayout(`
    ${emailSection({
      eyebrow: `Pedido #${id}`,
      title: 'Recebemos seu pedido',
      html: `
        ${emailParagraph(`Olá, <strong>${escapeHtml(name)}</strong>! Falta só o pagamento via PIX para confirmar. Total: <strong>${formatCurrency(order.totalCents)}</strong>.`)}
        ${emailCallout(`
          <p style="margin:0 0 6px;font-size:11px;color:#7A6656;text-transform:uppercase;letter-spacing:.08em;">PIX copia e cola</p>
          <p style="margin:0;font-family:monospace;font-size:12px;color:#1E1208;word-break:break-all;line-height:1.5;">${escapeHtml(pix.copyPaste)}</p>
          ${expLabel ? `<p style="margin:10px 0 0;font-size:12px;color:#705A48;">Válido até ${expLabel}. Depois disso, gere um novo código na página do pedido.</p>` : ''}`)}
        ${emailParagraph('No app do seu banco, escolha Pix → Pix copia e cola, cole o código e confirme. A confirmação é automática.', { muted: true })}
        ${emailItemsTable(order)}
        ${emailCta('Ver pedido e QR Code', url)}`,
    })}
    ${emailSignature()}`, { preheader: `Falta só o PIX: ${formatCurrency(order.totalCents)}${expLabel ? `, válido até ${expLabel}` : ''}.` });
  return {
    subject: orderSubject(id, 'recebido, falta o PIX'),
    html,
    text: [
      `Olá, ${name}! Recebemos seu pedido #${id}. Falta só o pagamento via PIX (${formatCurrency(order.totalCents)}).`, '',
      'PIX copia e cola:', pix.copyPaste, '',
      ...(expLabel ? [`Válido até ${expLabel}.`, ''] : []),
      `Ver pedido e QR Code: ${url}`,
    ].join('\n'),
  };
}

/** PIX venceu sem pagamento: oferece gerar outro. */
export function buildPixExpired(order: Pick<Order, 'id' | 'totalCents'>, name: string): EmailPayload {
  const id = shortOrderId(order.id);
  const url = orderUrl(order);
  const total = formatCurrency(order.totalCents);
  const html = emailLayout(`
    ${emailSection({
      eyebrow: `Pedido #${id}`,
      title: 'O PIX expirou',
      html: `
        ${emailParagraph(`Olá, <strong>${escapeHtml(name)}</strong>. O tempo de pagamento do pedido (${total}) acabou, mas ainda dá tempo: gere um novo código PIX na página do pedido.`)}
        ${emailParagraph('O pedido é cancelado automaticamente se não for pago em até 48h após a criação.', { muted: true })}
        ${emailCta('Gerar novo PIX', url)}`,
    })}
    ${emailSignature()}`, { preheader: `O PIX venceu, mas dá para gerar um novo código para o pedido de ${total}.` });
  return {
    subject: orderSubject(id, 'com PIX expirado'),
    html,
    text: [
      `Olá, ${name}.`, '',
      `O tempo para pagamento do pedido #${id} (${total}) expirou. Você ainda pode pagar: acesse o pedido e gere um novo código PIX.`, '',
      `Acessar pedido: ${url}`, '',
      'O pedido será cancelado automaticamente se não for pago em 48h após a criação.',
    ].join('\n'),
  };
}

/** Pedido cancelado (pela loja ou pelo cliente). */
export function buildCancelled(
  order: { id: string; items: EmailItem[]; totalCents: number } & EmailMoney,
  name: string,
  { refund, byCustomer = false, reason }: { refund: boolean; byCustomer?: boolean; reason?: string },
): EmailPayload {
  const id = shortOrderId(order.id);
  const url = orderUrl(order);
  const total = formatCurrency(order.totalCents);
  const intro = byCustomer
    ? `Olá, <strong>${escapeHtml(name)}</strong>. Confirmamos o cancelamento do seu pedido #${id}, como você pediu.`
    : `Olá, <strong>${escapeHtml(name)}</strong>. Seu pedido #${id} foi cancelado.`;
  const money = refund
    ? `O valor de <strong>${total}</strong> será devolvido pelo mesmo meio de pagamento.`
    : 'Nenhuma cobrança foi feita.';
  const html = emailLayout(`
    ${emailSection({
      eyebrow: `Pedido #${id}`,
      title: 'Pedido cancelado',
      html: `
        ${emailParagraph(intro)}
        ${reason ? emailParagraph(`Motivo: ${escapeHtml(reason)}`, { muted: true }) : ''}
        ${emailCallout(`<p style="margin:0;font-size:14px;color:#2C1F14;line-height:1.6;">${money}</p>`)}
        ${emailParagraph('Se tiver qualquer dúvida, é só responder este e-mail.', { muted: true })}
        ${emailItemsTable(order)}
        ${emailCta('Ver pedido', url)}`,
    })}
    ${emailSignature()}`, { preheader: refund ? `Pedido cancelado. O valor de ${total} será devolvido.` : 'Pedido cancelado. Nenhuma cobrança foi feita.' });
  return {
    subject: orderSubject(id, 'cancelado'),
    html,
    text: [
      byCustomer ? `Olá, ${name}. Confirmamos o cancelamento do seu pedido #${id}.` : `Olá, ${name}. Seu pedido #${id} foi cancelado.`,
      ...(reason ? [`Motivo: ${reason}`] : []),
      refund ? `O valor de ${total} será devolvido pelo mesmo meio de pagamento.` : 'Nenhuma cobrança foi feita.',
      '', 'Dúvidas? Responda este e-mail.', `Pedido: ${url}`,
    ].join('\n'),
  };
}

/** Aviso do cron: pedido sem pagamento há 24h, cancelado em mais 24h. */
export function buildPaymentReminder(
  order: { id: string; items: EmailItem[]; totalCents: number } & EmailMoney,
  name: string,
): EmailPayload {
  const id = shortOrderId(order.id);
  const url = orderUrl(order);
  const total = formatCurrency(order.totalCents);
  const html = emailLayout(`
    ${emailSection({
      eyebrow: `Pedido #${id}`,
      title: 'Seu pedido ainda espera o pagamento',
      html: `
        ${emailParagraph(`Olá, <strong>${escapeHtml(name)}</strong>. Seu pedido #${id} (${total}) ainda não foi pago.`)}
        ${emailCallout(`<p style="margin:0;font-size:14px;color:#2C1F14;line-height:1.6;">Se o pagamento não for feito em <strong>24 horas</strong>, o pedido é cancelado e os itens voltam para a loja.</p>`)}
        ${emailItemsTable(order)}
        ${emailCta('Pagar agora', url)}`,
    })}
    ${emailSignature()}`, { preheader: `Seu pedido de ${total} ainda espera o pagamento. Faltam 24 horas.` });
  return {
    subject: orderSubject(id, 'aguardando pagamento'),
    html,
    text: [
      `Olá, ${name}. Seu pedido #${id} (${total}) ainda não foi pago.`,
      'Se o pagamento não for feito em 24 horas, o pedido é cancelado.',
      '', `Pagar agora: ${url}`,
    ].join('\n'),
  };
}
