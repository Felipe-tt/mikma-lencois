/**
 * Desistência pelo site (CDC, art. 49): pedido pago que ainda não chegou.
 * Antes de pagar, o cliente só cancela; depois de entregue, pede a devolução.
 */
export const WITHDRAWAL_STATUSES = ['paid', 'preparing', 'shipped'] as const;

/** Por que este pedido não aceita "Desistir da compra", ou null. */
export function withdrawalBlockReason(status: string): string | null {
  if ((WITHDRAWAL_STATUSES as readonly string[]).includes(status)) return null;
  if (status === 'delivered') return 'O pedido já foi entregue: peça a devolução no próprio pedido, em Trocas e devoluções.';
  if (status === 'pending_payment' || status === 'payment_expired') return 'Este pedido ainda não foi pago: é só cancelar.';
  if (status === 'cancelled') return 'Este pedido já foi cancelado.';
  return 'Não dá para desistir deste pedido pelo site. Fale com a gente.';
}
