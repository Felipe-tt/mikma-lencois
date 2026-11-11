/**
 * Quanto devolver numa devolução e se dá para estornar pela AbacatePay.
 * Pura: recebe o pedido e as peças devolvidas como estão no banco.
 *
 * A AbacatePay só estorna a cobrança inteira. Então:
 *  - devolveu o pedido todo: estorno do total pago (frete incluído, como diz
 *    a política) direto pela AbacatePay;
 *  - devolveu só parte: o valor das peças (com o desconto do pedido
 *    distribuído) volta por fora, por PIX, e a equipe registra no painel.
 */
interface ItemPedido { sku: string; quantity: number; unitPrice: number }
interface Pagamento {
  method?: string; txId?: string; checkoutId?: string; paidAt?: unknown;
  confirmedManuallyBy?: string; abacateSandbox?: boolean; refundStatus?: string;
}
export interface PedidoParaEstorno {
  items: ItemPedido[];
  totalCents: number;
  delivery?: { priceCents?: number } | null;
  payment?: Pagamento;
}

export function valorDaDevolucao(order: PedidoParaEstorno, devolvidos: { sku: string; quantity: number }[]): { cents: number; inteira: boolean } {
  const comprado = new Map<string, number>();
  for (const i of order.items) comprado.set(i.sku, (comprado.get(i.sku) ?? 0) + i.quantity);
  const voltou = new Map<string, number>();
  for (const i of devolvidos) voltou.set(i.sku, (voltou.get(i.sku) ?? 0) + i.quantity);
  const inteira = [...comprado].every(([sku, q]) => (voltou.get(sku) ?? 0) >= q);
  if (inteira) return { cents: order.totalCents, inteira };
  const subtotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const pecas = order.items.reduce((s, i) => s + i.unitPrice * Math.min(voltou.get(i.sku) ?? 0, i.quantity), 0);
  const semFrete = Math.max(0, order.totalCents - (order.delivery?.priceCents ?? 0));
  const cents = subtotal > 0 ? Math.min(semFrete, Math.round((semFrete * pecas) / subtotal)) : 0;
  return { cents, inteira };
}

/** Qual cobrança estornar na AbacatePay, ou por que não dá. */
export function cobrancaAbacate(p: Pagamento | undefined):
  | { ok: true; kind: 'transparent' | 'checkout'; chargeId: string; sandbox: boolean }
  | { ok: false; motivo: string } {
  if (!p?.paidAt) return { ok: false, motivo: 'O pedido não consta como pago.' };
  if (p.confirmedManuallyBy) return { ok: false, motivo: 'O pedido foi pago por fora da AbacatePay.' };
  // Cartão no próprio site (card_) e PIX são cobranças transparentes;
  // cartão pela página da AbacatePay é um checkout (bill_).
  const transparentCard = p.method === 'card' && !!p.txId?.startsWith('card_');
  const kind = p.method === 'card' && !transparentCard ? 'checkout' as const : 'transparent' as const;
  const chargeId = kind === 'transparent' ? p.txId : p.checkoutId;
  if (!chargeId) return { ok: false, motivo: 'Cobrança da AbacatePay não encontrada no pedido.' };
  return { ok: true, kind, chargeId, sandbox: !!p.abacateSandbox };
}
