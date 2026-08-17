export interface StockLine {
  sku: string;
  quantity: number;
  productId: string; // só pra mensagem de erro amigável ("X não tem estoque"), não usado na lógica
}

interface ItemWithOptionalSwap {
  productId: string;
  sku: string;
  quantity: number;
  swapSku?: string;
  swapQty?: number;
}

/**
 * Expande os itens de um carrinho/pedido nas linhas de estoque que
 * realmente precisam ser checadas/reservadas/liberadas. Normalmente é
 * 1 linha por item (o próprio SKU), mas um item com fronha trocada (ver
 * JogoDeCamaBuyBox) vira 2 linhas: o SKU do Jogo de Cama em si, e o SKU
 * da Fronha escolhida — pra não vender a mesma fronha duas vezes sem
 * perceber.
 *
 * Linhas com o mesmo SKU são mescladas (quantidade somada) — importante
 * porque dois Jogos de Cama diferentes no mesmo pedido podem ser
 * trocados pela MESMA fronha, e escrever duas vezes no mesmo documento
 * dentro de uma única transação do Firestore é undefined behavior.
 * Mesclar aqui também deixa a checagem de disponibilidade mais correta:
 * compara a demanda total contra o estoque, não cada linha isolada.
 *
 * Usada nos dois lados: on reserva (create-pix, create-checkout) e em
 * TODO ponto que libera estoque reservado (cancelamento, expiração,
 * webhook de pagamento). Centralizar aqui evita ter que lembrar de mexer
 * em 5+ arquivos toda vez que a lógica de reserva mudar.
 */
export function expandStockLines(items: ItemWithOptionalSwap[]): StockLine[] {
  const bySku = new Map<string, StockLine>();
  function addLine(sku: string, quantity: number, productId: string) {
    const existing = bySku.get(sku);
    if (existing) {
      existing.quantity += quantity;
    } else {
      bySku.set(sku, { sku, quantity, productId });
    }
  }
  for (const item of items) {
    addLine(item.sku, item.quantity, item.productId);
    if (item.swapSku && item.swapQty) {
      // productId da fronha trocada: primeiro segmento do SKU dela
      // (formato productId_variantId). Só usado pra mensagem de erro
      // amigável — se não achar, cai no próprio SKU como fallback.
      const swapProductId = item.swapSku.split('_')[0] || item.swapSku;
      addLine(item.swapSku, item.swapQty, swapProductId);
    }
  }
  return Array.from(bySku.values());
}
