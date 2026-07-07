interface OrderItemLike {
  productName: string;
  quantity: number;
}

/**
 * Monta um resumo curto e legível dos itens do pedido, ex:
 * "2x Lençol Queen Branco" ou "3x Fronha Avulsa + 2 itens"
 * Trunca pra caber bem numa notificação push (título + corpo curtos).
 */
export function summarizeOrderItems(items: OrderItemLike[], maxChars = 60): string {
  if (!items || items.length === 0) return 'Pedido';

  const parts = items.map((i) => `${i.quantity}x ${i.productName}`);
  let summary = parts[0];
  let shown = 1;

  for (let i = 1; i < parts.length; i++) {
    const candidate = `${summary} + ${parts[i]}`;
    if (candidate.length > maxChars) break;
    summary = candidate;
    shown++;
  }

  const remaining = items.length - shown;
  if (remaining > 0) {
    summary += ` + ${remaining} ${remaining === 1 ? 'item' : 'itens'}`;
  }

  return summary;
}
