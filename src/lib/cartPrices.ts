import type { CartItem } from '@/types';

export interface PriceChange { productName: string; from: number; to: number }

/**
 * Itens do carrinho com o preço atual de cada produto. O carrinho guarda o
 * preço de quando o item entrou e o servidor cobra o preço atual: sem isso,
 * o resumo mostrava um valor e o pagamento era de outro (no cartão, o
 * "valor do pedido mudou" se repetia a cada tentativa). Devolve null quando
 * nada mudou.
 */
export function withCurrentPrices(items: CartItem[], prices: Map<string, number>): { items: CartItem[]; changes: PriceChange[] } | null {
  const changes: PriceChange[] = [];
  const next = items.map(item => {
    const price = prices.get(item.productId);
    if (price === undefined || !Number.isInteger(price) || price <= 0 || price === item.unitPrice) return item;
    if (!changes.some(c => c.productName === item.productName)) changes.push({ productName: item.productName, from: item.unitPrice, to: price });
    return { ...item, unitPrice: price };
  });
  return changes.length ? { items: next, changes } : null;
}
