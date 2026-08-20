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
  swapQtyPerUnit?: number; // quantas unidades da fronha trocada por CADA unidade deste item (ex: 2 fronhas por Jogo de Cama)
}

/**
 * Expande os itens de um carrinho/pedido nas linhas de estoque que
 * realmente precisam ser checadas/reservadas/liberadas. Normalmente é
 * 1 linha por item (o próprio SKU), mas um item com fronha trocada (ver
 * JogoDeCamaBuyBox) vira 2 linhas: o SKU do Jogo de Cama em si, e o SKU
 * da Fronha escolhida — pra não vender a mesma fronha duas vezes sem
 * perceber.
 *
 * swapQtyPerUnit é POR UNIDADE do item, não um total fixo — se o cliente
 * compra 2 Jogos de Cama com a mesma troca, a linha da fronha soma
 * quantity(2) × swapQtyPerUnit(2) = 4, não fica travada em 2. Isso
 * importa porque a quantidade do item pode mudar depois de adicionado
 * ao carrinho (botão +/- na página do carrinho), sem passar de novo
 * pelo componente que sabe a regra "2 fronhas por jogo".
 *
 * Linhas com o mesmo SKU são mescladas (quantidade somada) — importante
 * porque dois Jogos de Cama diferentes no mesmo pedido podem ser
 * trocados pela MESMA fronha, e escrever duas vezes no mesmo documento
 * dentro de uma única transação do Firestore é undefined behavior.
 * Mesclar aqui também deixa a checagem de disponibilidade mais correta:
 * compara a demanda total contra o estoque, não cada linha isolada.
 *
 * IMPORTANTE — validação de segurança: esta função NÃO valida se o
 * swapSku é legítimo (ex: se é realmente uma Fronha ativa, se o item
 * principal é realmente um Jogo de Cama, se swapQtyPerUnit bate com o
 * valor esperado pela regra de negócio). Isso é feito à parte, em
 * validateAndSanitizeSwaps, ANTES de chamar expandStockLines — o
 * carrinho vem direto do Firestore, escrito pelo client SDK, então
 * swapSku/swapQtyPerUnit são dados não confiáveis (o cliente podia
 * apontar pra qualquer produto da loja e pedir uma quantidade absurda).
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
    if (item.swapSku && item.swapQtyPerUnit) {
      // productId da fronha trocada: primeiro segmento do SKU dela
      // (formato productId_variantId). Só usado pra mensagem de erro
      // amigável — se não achar, cai no próprio SKU como fallback.
      const swapProductId = item.swapSku.split('_')[0] || item.swapSku;
      addLine(item.swapSku, item.quantity * item.swapQtyPerUnit, swapProductId);
    }
  }
  return Array.from(bySku.values());
}
