import { describe, it, expect } from 'vitest';
import { sanitizeSwaps, FRONHAS_POR_JOGO, type ProductLookup } from './fronhaSwap';

const jogo: ProductLookup = { id: 'jogo1', active: true, category: 'Jogos de cama' };
const fronhaAtiva: ProductLookup = { id: 'fronhaX', active: true, category: 'Fronhas' };
const fronhaInativa: ProductLookup = { id: 'fronhaY', active: false, category: 'Fronhas' };
const lencol: ProductLookup = { id: 'lencol1', active: true, category: 'Lençóis' };
const naoFronha: ProductLookup = { id: 'travesseiro1', active: true, category: 'Travesseiros' };

function productMap(...items: ProductLookup[]): Map<string, ProductLookup> {
  return new Map(items.map(p => [p.id, p]));
}

describe('sanitizeSwaps', () => {
  it('item sem swap passa direto, sem mudança', () => {
    const items = [{ productId: 'jogo1', sku: 'jogo1_v1', quantity: 1 }];
    expect(sanitizeSwaps(items, productMap(jogo))).toEqual(items);
  });

  it('swap válido (jogo real + fronha ativa + quantidade certa) é mantido', () => {
    const items = [{
      productId: 'jogo1', sku: 'jogo1_v1', quantity: 1, note: 'Fronha trocada: X',
      swapSku: 'fronhaX_v1', swapQtyPerUnit: FRONHAS_POR_JOGO,
    }];
    const result = sanitizeSwaps(items, productMap(jogo, fronhaAtiva));
    expect(result[0].swapSku).toBe('fronhaX_v1');
    expect(result[0].note).toBe('Fronha trocada: X');
  });

  it('CRÍTICO: swapSku apontando pra produto que não é Fronha é removido', () => {
    const items = [{
      productId: 'jogo1', sku: 'jogo1_v1', quantity: 1, note: 'Fronha trocada: forjado',
      swapSku: 'travesseiro1_v1', swapQtyPerUnit: FRONHAS_POR_JOGO,
    }];
    const result = sanitizeSwaps(items, productMap(jogo, naoFronha));
    expect(result[0].swapSku).toBeUndefined();
    expect(result[0].note).toBeUndefined();
  });

  it('CRÍTICO: swapQtyPerUnit forjado (diferente do esperado) é removido', () => {
    const items = [{
      productId: 'jogo1', sku: 'jogo1_v1', quantity: 1,
      swapSku: 'fronhaX_v1', swapQtyPerUnit: 9999,
    }];
    const result = sanitizeSwaps(items, productMap(jogo, fronhaAtiva));
    expect(result[0].swapSku).toBeUndefined();
  });

  it('CRÍTICO: item principal que não é Jogo de Cama não pode ter swap', () => {
    const items = [{
      productId: 'lencol1', sku: 'lencol1_v1', quantity: 1,
      swapSku: 'fronhaX_v1', swapQtyPerUnit: FRONHAS_POR_JOGO,
    }];
    const result = sanitizeSwaps(items, productMap(lencol, fronhaAtiva));
    expect(result[0].swapSku).toBeUndefined();
  });

  it('fronha desativada depois de escolhida: swap é removido, item continua', () => {
    const items = [{
      productId: 'jogo1', sku: 'jogo1_v1', quantity: 1,
      swapSku: 'fronhaY_v1', swapQtyPerUnit: FRONHAS_POR_JOGO,
    }];
    const result = sanitizeSwaps(items, productMap(jogo, fronhaInativa));
    expect(result[0].swapSku).toBeUndefined();
    expect(result[0].productId).toBe('jogo1'); // item principal continua na compra
  });

  it('swapSku de produto inexistente é removido', () => {
    const items = [{
      productId: 'jogo1', sku: 'jogo1_v1', quantity: 1,
      swapSku: 'produtoQueNaoExiste_v1', swapQtyPerUnit: FRONHAS_POR_JOGO,
    }];
    const result = sanitizeSwaps(items, productMap(jogo));
    expect(result[0].swapSku).toBeUndefined();
  });
});
