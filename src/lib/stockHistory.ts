/**
 * Entrada do `inventory.history` para movimentações feitas pelo fluxo de
 * pedidos (venda online paga, cancelamento que devolve peças). Antes só as
 * movimentações manuais e da loja física iam pro histórico, e o estoque
 * caía sem explicação.
 *
 * O inventory é de leitura pública: grava só o código curto do pedido (o
 * mesmo que o cliente vê), nunca o id inteiro nem dados de quem comprou.
 * `line` diferencia duas linhas do mesmo pedido no mesmo SKU (o arrayUnion
 * descartaria a segunda se os objetos fossem idênticos).
 */
export type OrderStockSource = 'online_sale' | 'order_cancel';

export interface OrderStockLog {
  type: 'in' | 'out';
  quantity: number;
  reason: string;
  date: string;
  by: 'sistema';
  source: OrderStockSource;
  order: string;
  line: number;
}

export function orderCode(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

export function orderStockLog(
  orderId: string,
  source: OrderStockSource,
  quantity: number,
  line: number,
  date: string = new Date().toISOString(),
): OrderStockLog {
  const code = orderCode(orderId);
  return {
    type: source === 'online_sale' ? 'out' : 'in',
    quantity,
    reason: `Pedido #${code}`,
    date,
    by: 'sistema',
    source,
    order: code,
    line,
  };
}

export const ORDER_STOCK_SOURCE_LABEL: Record<OrderStockSource, string> = {
  online_sale: 'Venda online',
  order_cancel: 'Cancelamento',
};
