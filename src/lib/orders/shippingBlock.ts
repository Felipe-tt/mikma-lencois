/**
 * Motivo para NÃO enviar um pedido pago, ou null se pode enviar. Contestação
 * aberta ou estorno já feito com o pedido ativo: enviar seria mandar o
 * produto sem o dinheiro (antes o painel só avisava e deixava despachar).
 */
export function shippingBlockReason(order: { payment?: unknown }): string | null {
  const p = (order.payment ?? {}) as { dispute?: { state?: string }; refundStatus?: string };
  if (p.dispute?.state === 'open') return 'Este pagamento está em contestação. Não envie até ela ser resolvida na AbacatePay.';
  if (p.refundStatus === 'done') return 'O pagamento deste pedido foi estornado. Não envie: cancele o pedido.';
  return null;
}
