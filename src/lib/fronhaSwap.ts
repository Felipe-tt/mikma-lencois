// Quantas fronhas cada Jogo de Cama inclui. Único lugar que define esse
// número — usado tanto pra sanitizar o carrinho no backend quanto (via
// import direto do componente) pra montar a escolha no frontend.
export const FRONHAS_POR_JOGO = 2;

export interface ProductLookup {
  id: string;
  name: string;
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
 * sem passar por nenhuma API — então swapSku/swapQtyPerUnit/note são
 * dados NÃO CONFIÁVEIS por padrão, do mesmo jeito que preço e nome de
 * produto já não são (ver comentário "nunca confia no cliente" em
 * create-pix/checkout).
 *
 * Sem essa validação, dois problemas reais:
 * 1. Alguém editando o próprio carrinho manualmente podia apontar
 *    swapSku pra QUALQUER produto da loja com uma quantidade arbitrária,
 *    fazendo o backend reservar/debitar estoque de um produto caro de
 *    graça, sem pagar nada por ele.
 * 2. Alguém podia mandar só um `note` de texto livre tipo "Fronha
 *    trocada: X" SEM nenhum swapSku — enganando o vendedor a achar que
 *    uma troca foi reservada quando estoque nenhum foi tocado. Por isso
 *    `note` nunca é aceito do cliente: é sempre GERADO aqui a partir do
 *    nome real do produto validado, ou removido por completo.
 *
 * Regras exigidas pra aceitar um swap:
 * 1. O item principal é de fato um "Jogos de cama" (só esses têm troca).
 * 2. O produto do swapSku existe, está ativo, e é da categoria "Fronhas".
 * 3. swapQtyPerUnit é exatamente FRONHAS_POR_JOGO — não aceita nenhum
 *    outro valor vindo do cliente, mesmo que pareça "razoável".
 *
 * Qualquer item que não passar tem o swap E a nota removidos (estoque da
 * fronha não é tocado) — não bloqueia o checkout inteiro por causa
 * disso, só ignora a troca inválida/forjada/desatualizada e segue com a
 * fronha padrão do jogo.
 */
export function sanitizeSwaps<T extends CartItemLike>(
  items: T[],
  products: Map<string, ProductLookup>
): T[] {
  return items.map(item => {
    const mainProduct = products.get(item.productId);
    const swapProductId = item.swapSku?.split('_')[0];
    const swapProduct = swapProductId ? products.get(swapProductId) : undefined;

    const valid =
      !!item.swapSku &&
      !!item.swapQtyPerUnit &&
      mainProduct?.category === 'Jogos de cama' &&
      swapProduct?.active === true &&
      swapProduct?.category === 'Fronhas' &&
      item.swapQtyPerUnit === FRONHAS_POR_JOGO;

    if (valid) {
      // Nota sempre construída aqui a partir do nome real do produto —
      // nunca aceita o texto livre que o cliente mandou.
      const { note: _clientNote, ...rest } = item;
      return { ...rest, note: `Fronha trocada: ${swapProduct!.name}` } as T;
    }

    // Sem swap válido (ausente, forjado ou desatualizado): remove
    // qualquer swapSku/swapQtyPerUnit/note que o item tiver. Nota só
    // faz sentido junto de um swap validado — sem isso, nunca é exibida.
    const { swapSku: _s, swapQtyPerUnit: _q, note: _n, ...rest } = item;
    return rest as T;
  });
}
