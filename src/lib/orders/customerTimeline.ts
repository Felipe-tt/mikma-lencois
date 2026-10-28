/**
 * Histórico do pedido como o cliente vê.
 *
 * A timeline do pedido guarda notas de operação (quem marcou o pagamento,
 * txId, custo da Uber, e-mail de quem estornou…). Nada disso pode aparecer
 * pro cliente: aqui só passa texto de uma lista fechada. Nota desconhecida
 * some, em vez de vazar.
 */

export interface TimelineEntry { status: string; at: string; note?: string | null }
export interface CustomerEvent { status: string; at: string; title: string; detail?: string }

export const TIMELINE_LABEL: Record<string, string> = {
  created:            'Pedido criado',
  payment_initiated:  'Aguardando pagamento',
  payment_processing: 'Pagamento em análise',
  payment_confirmed:  'Pagamento confirmado',
  payment_expired:    'PIX expirou',
  payment_failed:     'Pagamento recusado',
  pending_payment:    'Aguardando pagamento',
  paid:               'Pagamento confirmado',
  preparing:          'Pedido em preparação',
  shipped:            'Pedido despachado',
  delivery_cancelled: 'Entrega remarcada, novo envio em breve',
  delivered:          'Pedido entregue',
  cancelled:          'Pedido cancelado',
};

// Notas que podem ser mostradas, com o texto pro cliente. null = esconde a
// nota mas mantém o evento.
const NOTE_TEXT: Record<string, string | null> = {
  'Pedido criado':                'Pedido criado',
  'PIX gerado':                   'PIX gerado',
  'Novo PIX gerado pelo cliente': 'Novo PIX gerado',
  'Cliente retirou na loja':      'Retirado na loja',
  'Confirmado pelo cliente':      'Você confirmou o recebimento',
  'Cancelado pelo cliente':       'Cancelado por você',
  'Cancelado pelo lojista':       'Cancelado pela loja',
  'Conta excluída pelo cliente':  'Cancelado porque a conta foi excluída',
  'Cancelado automaticamente por falta de pagamento após 48h': 'Cancelado por falta de pagamento em 48h',
};

// Etapas da corrida da Uber viram o título do evento ("Entregador a caminho").
const UBER_TITLE: Record<string, string | null> = {
  'Procurando entregador (Uber Direct)': 'Procurando entregador',
  'Entregador a caminho da loja':        'Entregador a caminho da loja',
  'Entregador saiu com o pacote':        'Entregador retirou o pedido',
  'Entregador a caminho do cliente':     'Entregador a caminho',
  'Entregue via Uber Direct':            'Pedido entregue',
  'Entrega Uber Direct cancelada':       null,
  'Pacote devolvido pelo Uber Direct':   null,
};

// Eventos inteiros que são só operação da loja.
const INTERNAL_EVENT = [/^Pagamento recebido depois d/, /^Contestação/, /^Código de rastreio corrigido/, /^Pedido conferido pela equipe/, /^Segunda cobrança paga/, /^Pagamento pela AbacatePay .*chegou depois/];
const REFUND = /^Estorno/;

function cancelReasonIsPublic(note: string): boolean {
  // No cancelamento, a nota livre é o motivo que o lojista escreveu pro
  // cliente (admin-cancel). As de operação têm prefixo conhecido.
  return !REFUND.test(note) && !INTERNAL_EVENT.some(r => r.test(note));
}

function toEvent(e: TimelineEntry): CustomerEvent | null {
  const note = (e.note ?? '').trim();
  if (note && INTERNAL_EVENT.some(r => r.test(note))) return null;
  if (note && REFUND.test(note)) return { status: 'refunded', at: e.at, title: 'Reembolso feito' };

  if (note && note in UBER_TITLE) {
    const t = UBER_TITLE[note];
    return t ? { status: e.status, at: e.at, title: t } : null;
  }

  const title = TIMELINE_LABEL[e.status];
  if (!title) return null;

  let detail: string | undefined;
  if (note) {
    if (note in NOTE_TEXT) detail = NOTE_TEXT[note] ?? undefined;
    else if (/^(Cartão no site|Checkout cartão iniciado) \((\d+)x\)$/.test(note)) {
      const n = Number(note.match(/\((\d+)x\)/)![1]);
      detail = n > 1 ? `Cartão de crédito em ${n}x` : 'Cartão de crédito';
    } else if (e.status === 'cancelled' && cancelReasonIsPublic(note)) {
      detail = note.slice(0, 300);
    }
  }
  if (detail === title) detail = undefined;
  return { status: e.status, at: e.at, title, ...(detail ? { detail } : {}) };
}

/** Eventos do mais antigo pro mais novo, sem repetição seguida. */
export function customerTimeline(timeline: TimelineEntry[] | undefined): CustomerEvent[] {
  const out: CustomerEvent[] = [];
  for (const e of timeline ?? []) {
    const ev = toEvent(e);
    if (!ev) continue;
    const prev = out[out.length - 1];
    if (prev && prev.title === ev.title && prev.detail === ev.detail) continue;
    out.push(ev);
  }
  return out;
}

/** Motivo do cancelamento que pode ir pro cliente (o mais recente). */
export function customerCancelReason(timeline: TimelineEntry[] | undefined): string | undefined {
  for (const e of [...(timeline ?? [])].reverse()) {
    if (e.status !== 'cancelled' || !e.note) continue;
    const ev = toEvent(e);
    if (ev?.detail) return ev.detail;
  }
  return undefined;
}
