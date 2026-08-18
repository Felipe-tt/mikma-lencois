// Quantas fronhas cada Jogo de Cama inclui. Único lugar que define esse
// número — usado tanto pra sanitizar o carrinho no backend quanto (via
// import direto do componente) pra montar a escolha no frontend.
export const FRONHAS_POR_JOGO = 2;

export interface ProductLookup {
  id: string;
  active: boolean;
  category: string;
}

interface CartItemLike {
  productId: string;
  sku: string;
  quantity: number;
  note?: string;
  swapSku?: string;
  swapQtyPerUnit?: number;
}

/**
 * O carrinho (`carts/{uid}`) é escrito direto pelo client SDK do Firestore,
 * sem passar por nenhuma API — então swapSku/swapQtyPerUnit são dados NÃO
 * CONFIÁVEIS por padrão, do mesmo jeito que preço e nome de produto já não
 * são (ver comentário "nunca confia no cliente" em create-pix/checkout).
 * Sem essa validação, alguém editando o próprio carrinho manualmente podia
 * apontar swapSku pra QUALQUER produto da loja com uma quantidade
 * arbitrária, fazendo o backend reservar/debitar estoque de um produto
 * caro de graça, sem pagar nada por ele.
 *
 * Regras exigidas pra aceitar um swap:
 * 1. O item principal é de fato um "Jogos de cama" (só esses têm troca).
 * 2. O produto do swapSku existe, está ativo, e é da categoria "Fronhas".
 * 3. swapQtyPerUnit é exatamente FRONHAS_POR_JOGO — não aceita nenhum
 *    outro valor vindo do cliente, mesmo que pareça "razoável".
 *
 * Qualquer item que não passar tem o swap removido (nota some, estoque
 * da fronha não é tocado) — não bloqueia o checkout inteiro por causa
 * disso, só ignora a troca inválida/desatualizada e segue com a fronha
 * padrão do jogo.
 */
export function sanitizeSwaps<T extends CartItemLike>(
  items: T[],
  products: Map<string, ProductLookup>
): T[] {
  return items.map(item => {
    if (!item.swapSku || !item.swapQtyPerUnit) return item;

    const mainProduct = products.get(item.productId);
    const swapProductId = item.swapSku.split('_')[0];
    const swapProduct = products.get(swapProductId);

    const valid =
      mainProduct?.category === 'Jogos de cama' &&
      swapProduct?.active === true &&
      swapProduct?.category === 'Fronhas' &&
      item.swapQtyPerUnit === FRONHAS_POR_JOGO;

    if (valid) return item;

    // Swap inválido/forjado/desatualizado: remove os campos de swap E a
    // nota (que só existe pra descrever esse swap) — não bloqueia o
    // checkout, só ignora a troca e segue com a fronha padrão do jogo.
    // Sem isso o vendedor veria "Fronha trocada: X" no pedido achando
    // que reservou estoque de algo que na verdade foi ignorado.
    const { swapSku: _swapSku, swapQtyPerUnit: _swapQtyPerUnit, note: _note, ...rest } = item;
    return rest as T;
  });
}
