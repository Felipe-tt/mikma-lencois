/**
 * Máximo de pedidos "aguardando pagamento" simultâneos por cliente, no PIX e
 * no cartão. Cada pedido pendente reserva estoque até pagar ou expirar.
 */
export const MAX_PENDING_ORDERS_PER_USER = 3;
