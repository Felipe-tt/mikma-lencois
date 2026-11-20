/**
 * Dinheiro que já voltou ao cliente num pedido: o estorno total (pedido
 * cancelado ou devolvido inteiro) ou a soma das devoluções parciais. O
 * Início e os Relatórios descontam isso da receita, com a mesma conta.
 */
export function refundedCents(o: { totalCents: number; payment?: unknown }): number {
  const p = o.payment as { refundStatus?: string; partialRefundCents?: number } | undefined;
  return p?.refundStatus === 'done' ? o.totalCents : Math.min(o.totalCents, Math.max(0, p?.partialRefundCents ?? 0));
}
