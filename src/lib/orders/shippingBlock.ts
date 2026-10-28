/**
 * Motivo para NÃO enviar um pedido pago, ou null se pode enviar. Contestação
 * aberta ou estorno já feito com o pedido ativo: enviar seria mandar o
 * produto sem o dinheiro (antes o painel só avisava e deixava despachar).
 */
export function shippingBlockReason(order: { payment?: unknown; risk?: unknown }): string | null {
  const p = (order.payment ?? {}) as { dispute?: { state?: string }; refundStatus?: string };
  if ((order.risk as { hold?: boolean } | undefined)?.hold) return 'Pedido marcado como suspeito. Confira os sinais no pedido e libere o envio antes de despachar.';
  if (p.dispute?.state === 'open') return 'Este pagamento está em contestação. Não envie até ela ser resolvida na AbacatePay.';
  if (p.refundStatus === 'done') return 'O pagamento deste pedido foi estornado. Não envie: cancele o pedido.';
  return null;
}
