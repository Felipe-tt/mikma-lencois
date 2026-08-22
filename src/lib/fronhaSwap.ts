export interface ProductLookup {
  id: string;
  name: string;
  active: boolean;
  category: string;
  fronhaCount?: number;   // definido pelo vendedor no cadastro (ver ProductForm), específico de cada Jogo de Cama
  variantSize?: string;   // tamanho da primeira variante, só usado pra inferir um padrão quando fronhaCount não foi definido
}

/**
 * Quantas fronhas um Jogo de Cama inclui. NÃO é um número fixo global —
 * cada jogo pode ter uma contagem diferente (ex: solteiro normalmente
 * vem com 1 fronha/1 travesseiro, casal/queen/king costumam vir com 2).
 * Erro que já cometemos uma vez aqui: tratar isso como constante única
 * pra todos os jogos, o que reservava fronha errada pra jogo solteiro.
 *
 * Prioridade: 1) o que o vendedor cadastrou explicitamente no produto
 * (`fronhaCount`); 2) se não cadastrado (produto legado, criado antes
 * desse campo existir), infere pelo tamanho da variante — solteiro/berço
 * geralmente é 1 travesseiro, os demais tamanhos geralmente são 2. Esse
 * fallback existe só pra produtos antigos não ficarem quebrados até
 * alguém editar e confirmar o valor certo; todo produto novo devia
 * preencher o campo explicitamente.
 */
export function getFronhaCount(product: Pick<ProductLookup, 'fronhaCount' | 'variantSize'>): number {
  if (typeof product.fronhaCount === 'number' && product.fronhaCount > 0) {
    return product.fronhaCount;
  }
  if (product.variantSize === 'solteiro' || product.variantSize === 'berco') return 1;
  return 2;
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
 * 3. swapQtyPerUnit é exatamente getFronhaCount(mainProduct) — a
 *    contagem PRÓPRIA desse jogo, não um número fixo global. Não aceita
 *    nenhum outro valor vindo do cliente, mesmo que pareça "razoável".
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
      item.swapQtyPerUnit === getFronhaCount(mainProduct);

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
