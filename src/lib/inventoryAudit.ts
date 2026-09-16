import { expandStockLines } from './orderStockLines';

export interface AuditOrderItem {
  productId: string;
  sku: string;
  quantity: number;
  swapSku?: string;
  swapQtyPerUnit?: number;
}

export interface SkuMismatch {
  sku: string;
  productId: string;
  currentReserved: number;
  expectedReserved: number;
  /** Positivo = sobrando reserva (trava estoque à toa). Negativo = faltando. */
  diff: number;
}

/**
 * Soma, por SKU, quanto deveria estar reservado, dados os itens de todos
 * os pedidos com status pending_payment (a fonte da verdade: pedidos
 * pagos já debitaram quantity e zeraram a reserva; cancelados e expirados
 * não reservam nada).
 *
 * Passa por expandStockLines de propósito, a mesma função usada em todo
 * ponto que reserva ou libera estoque de verdade (create-pix,
 * create-checkout, webhook de pagamento, cancelamento, cron de
 * expiração). Somar item.sku na mão aqui, como era feito antes, ignora o
 * swapSku e faz todo pedido com fronha trocada virar falso positivo.
 */
export function computeExpectedReserved(
  ordersItems: AuditOrderItem[][]
): Record<string, number> {
  const expected: Record<string, number> = {};
  for (const items of ordersItems) {
    for (const line of expandStockLines(items.filter(i => i.sku))) {
      expected[line.sku] = (expected[line.sku] ?? 0) + line.quantity;
    }
  }
  return expected;
}

/**
 * Compara o reserved atual de cada SKU do inventário com o esperado.
 * SKUs sem nenhuma reserva esperada contam como 0 (não some da lista) —
 * é justamente o caso mais comum de divergência: reserva que ficou presa
 * depois de um pedido já resolvido.
 */
export function findReservedMismatches(
  inventory: Array<{ sku: string; productId?: string; reserved?: number }>,
  expectedBySku: Record<string, number>
): SkuMismatch[] {
  const mismatches: SkuMismatch[] = [];
  for (const item of inventory) {
    const currentReserved = item.reserved ?? 0;
    const expectedReserved = expectedBySku[item.sku] ?? 0;
    if (currentReserved !== expectedReserved) {
      mismatches.push({
        sku: item.sku,
        productId: item.productId ?? '',
        currentReserved,
        expectedReserved,
        diff: currentReserved - expectedReserved,
      });
    }
  }
  return mismatches;
}
