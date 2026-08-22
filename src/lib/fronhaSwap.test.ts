import { describe, it, expect } from 'vitest';
import { sanitizeSwaps, getFronhaCount, type ProductLookup } from './fronhaSwap';

const jogoQueen: ProductLookup = { id: 'jogoQ', name: 'Jogo de Cama Queen 3 Peças', active: true, category: 'Jogos de cama', fronhaCount: 2 };
const jogoSolteiro: ProductLookup = { id: 'jogoS', name: 'Jogo Solteiro 2 Peças', active: true, category: 'Jogos de cama', fronhaCount: 1 };
const jogoLegadoSolteiro: ProductLookup = { id: 'jogoLS', name: 'Jogo Solteiro Antigo', active: true, category: 'Jogos de cama', variantSize: 'solteiro' }; // sem fronhaCount, produto legado
const jogoLegadoQueen: ProductLookup = { id: 'jogoLQ', name: 'Jogo Queen Antigo', active: true, category: 'Jogos de cama', variantSize: 'queen' }; // sem fronhaCount, produto legado
const fronhaAtiva: ProductLookup = { id: 'fronhaX', name: 'Fronha Floral Rosa', active: true, category: 'Fronhas' };
const naoFronha: ProductLookup = { id: 'travesseiro1', name: 'Travesseiro', active: true, category: 'Travesseiros' };

function productMap(...items: ProductLookup[]): Map<string, ProductLookup> {
  return new Map(items.map(p => [p.id, p]));
}

describe('getFronhaCount', () => {
  it('usa fronhaCount explícito quando definido', () => {
    expect(getFronhaCount({ fronhaCount: 1 })).toBe(1);
    expect(getFronhaCount({ fronhaCount: 2 })).toBe(2);
    expect(getFronhaCount({ fronhaCount: 4 })).toBe(4);
  });

  it('CRÍTICO: sem fronhaCount, infere 1 pra solteiro (não 2 — erro que já cometemos)', () => {
    expect(getFronhaCount({ variantSize: 'solteiro' })).toBe(1);
  });

  it('sem fronhaCount, infere 1 pra berço', () => {
    expect(getFronhaCount({ variantSize: 'berco' })).toBe(1);
  });

  it('sem fronhaCount, infere 2 pra casal/queen/king/unico', () => {
    expect(getFronhaCount({ variantSize: 'queen' })).toBe(2);
    expect(getFronhaCount({ variantSize: 'casal' })).toBe(2);
    expect(getFronhaCount({ variantSize: 'king' })).toBe(2);
    expect(getFronhaCount({ variantSize: 'unico' })).toBe(2);
  });

  it('sem fronhaCount nem variantSize, padrão é 2', () => {
    expect(getFronhaCount({})).toBe(2);
  });

  it('fronhaCount zero ou negativo (dado inválido) cai pro fallback por tamanho', () => {
    expect(getFronhaCount({ fronhaCount: 0, variantSize: 'solteiro' })).toBe(1);
    expect(getFronhaCount({ fronhaCount: -1, variantSize: 'queen' })).toBe(2);
  });
});

describe('sanitizeSwaps', () => {
  it('CRÍTICO: jogo solteiro com fronhaCount=1 só aceita swapQtyPerUnit=1, não 2', () => {
    const items = [{
      productId: 'jogoS', sku: 'jogoS_v1', quantity: 1,
      swapSku: 'fronhaX_v1', swapQtyPerUnit: 2, // errado: solteiro é 1
    }];
    const result = sanitizeSwaps(items, productMap(jogoSolteiro, fronhaAtiva));
    expect(result[0].swapSku).toBeUndefined(); // rejeitado

    const itemsCerto = [{
      productId: 'jogoS', sku: 'jogoS_v1', quantity: 1,
      swapSku: 'fronhaX_v1', swapQtyPerUnit: 1, // certo
    }];
    const resultCerto = sanitizeSwaps(itemsCerto, productMap(jogoSolteiro, fronhaAtiva));
    expect(resultCerto[0].swapSku).toBe('fronhaX_v1');
  });

  it('jogo queen com fronhaCount=2 só aceita swapQtyPerUnit=2', () => {
    const items = [{
      productId: 'jogoQ', sku: 'jogoQ_v1', quantity: 1,
      swapSku: 'fronhaX_v1', swapQtyPerUnit: 2,
    }];
    const result = sanitizeSwaps(items, productMap(jogoQueen, fronhaAtiva));
    expect(result[0].swapSku).toBe('fronhaX_v1');
  });

  it('produto legado (sem fronhaCount) solteiro: infere 1 pela variante', () => {
    const items = [{
      productId: 'jogoLS', sku: 'jogoLS_v1', quantity: 1,
      swapSku: 'fronhaX_v1', swapQtyPerUnit: 1,
    }];
    const result = sanitizeSwaps(items, productMap(jogoLegadoSolteiro, fronhaAtiva));
    expect(result[0].swapSku).toBe('fronhaX_v1');
  });

  it('produto legado (sem fronhaCount) queen: infere 2 pela variante', () => {
    const items = [{
      productId: 'jogoLQ', sku: 'jogoLQ_v1', quantity: 1,
      swapSku: 'fronhaX_v1', swapQtyPerUnit: 2,
    }];
    const result = sanitizeSwaps(items, productMap(jogoLegadoQueen, fronhaAtiva));
    expect(result[0].swapSku).toBe('fronhaX_v1');
  });

  it('swap válido é mantido, note sempre regenerada pelo servidor', () => {
    const items = [{
      productId: 'jogoQ', sku: 'jogoQ_v1', quantity: 1, note: 'texto qualquer do cliente',
      swapSku: 'fronhaX_v1', swapQtyPerUnit: 2,
    }];
    const result = sanitizeSwaps(items, productMap(jogoQueen, fronhaAtiva));
    expect(result[0].note).toBe('Fronha trocada: Fronha Floral Rosa');
  });

  it('CRÍTICO: note enviado sem nenhum swapSku é removido', () => {
    const items: Array<{ productId: string; sku: string; quantity: number; note?: string; swapSku?: string; swapQtyPerUnit?: number }> = [{
      productId: 'jogoQ', sku: 'jogoQ_v1', quantity: 1,
      note: 'Fronha trocada: Presente Grátis',
    }];
    const result = sanitizeSwaps(items, productMap(jogoQueen));
    expect(result[0].note).toBeUndefined();
    expect(result[0].swapSku).toBeUndefined();
  });

  it('CRÍTICO: swapSku apontando pra produto que não é Fronha é removido', () => {
    const items = [{
      productId: 'jogoQ', sku: 'jogoQ_v1', quantity: 1,
      swapSku: 'travesseiro1_v1', swapQtyPerUnit: 2,
    }];
    const result = sanitizeSwaps(items, productMap(jogoQueen, naoFronha));
    expect(result[0].swapSku).toBeUndefined();
  });

  it('CRÍTICO: item principal que não é Jogo de Cama não pode ter swap', () => {
    const lencol: ProductLookup = { id: 'lencol1', name: 'Lençol Branco', active: true, category: 'Lençóis' };
    const items = [{
      productId: 'lencol1', sku: 'lencol1_v1', quantity: 1,
      swapSku: 'fronhaX_v1', swapQtyPerUnit: 2,
    }];
    const result = sanitizeSwaps(items, productMap(lencol, fronhaAtiva));
    expect(result[0].swapSku).toBeUndefined();
  });

  it('fronha desativada: swap é removido, item continua', () => {
    const fronhaInativa: ProductLookup = { id: 'fronhaY', name: 'Fronha Descontinuada', active: false, category: 'Fronhas' };
    const items = [{
      productId: 'jogoQ', sku: 'jogoQ_v1', quantity: 1,
      swapSku: 'fronhaY_v1', swapQtyPerUnit: 2,
    }];
    const result = sanitizeSwaps(items, productMap(jogoQueen, fronhaInativa));
    expect(result[0].swapSku).toBeUndefined();
    expect(result[0].productId).toBe('jogoQ');
  });

  it('swapSku de produto inexistente é removido', () => {
    const items = [{
      productId: 'jogoQ', sku: 'jogoQ_v1', quantity: 1,
      swapSku: 'produtoQueNaoExiste_v1', swapQtyPerUnit: 2,
    }];
    const result = sanitizeSwaps(items, productMap(jogoQueen));
    expect(result[0].swapSku).toBeUndefined();
  });
});
