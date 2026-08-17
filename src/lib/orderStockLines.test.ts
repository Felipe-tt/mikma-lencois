import { describe, it, expect } from 'vitest';
import { expandStockLines } from './orderStockLines';

describe('expandStockLines', () => {
  it('item comum vira uma linha só', () => {
    expect(expandStockLines([{ productId: 'p1', sku: 'p1_v1', quantity: 2 }])).toEqual([
      { productId: 'p1', sku: 'p1_v1', quantity: 2 },
    ]);
  });

  it('item com fronha trocada vira duas linhas', () => {
    const lines = expandStockLines([
      { productId: 'jogo1', sku: 'jogo1_v1', quantity: 1, swapSku: 'fronha2_v1', swapQty: 2 },
    ]);
    expect(lines).toEqual([
      { productId: 'jogo1', sku: 'jogo1_v1', quantity: 1 },
      { productId: 'fronha2', sku: 'fronha2_v1', quantity: 2 },
    ]);
  });

  it('swapSku sem swapQty não gera linha extra (dado incompleto, ignora)', () => {
    const lines = expandStockLines([
      { productId: 'jogo1', sku: 'jogo1_v1', quantity: 1, swapSku: 'fronha2_v1' },
    ]);
    expect(lines).toEqual([{ productId: 'jogo1', sku: 'jogo1_v1', quantity: 1 }]);
  });

  it('mistura itens com e sem troca', () => {
    const lines = expandStockLines([
      { productId: 'lencol1', sku: 'lencol1_v1', quantity: 1 },
      { productId: 'jogo1', sku: 'jogo1_v1', quantity: 1, swapSku: 'fronha2_v1', swapQty: 2 },
      { productId: 'fronha1', sku: 'fronha1_v1', quantity: 3 },
    ]);
    expect(lines.map(l => l.sku).sort()).toEqual(['fronha1_v1', 'fronha2_v1', 'jogo1_v1', 'lencol1_v1']);
  });

  it('CRÍTICO: dois Jogos de Cama diferentes trocados pela mesma fronha mesclam numa linha só, quantidade somada', () => {
    const lines = expandStockLines([
      { productId: 'jogo1', sku: 'jogo1_v1', quantity: 1, swapSku: 'fronhaX_v1', swapQty: 2 },
      { productId: 'jogo2', sku: 'jogo2_v1', quantity: 1, swapSku: 'fronhaX_v1', swapQty: 2 },
    ]);
    const fronhaLine = lines.find(l => l.sku === 'fronhaX_v1');
    expect(fronhaLine?.quantity).toBe(4);
    // uma linha só por sku, nunca duas — evita escrever duas vezes no
    // mesmo documento dentro de uma transação do Firestore
    expect(lines.filter(l => l.sku === 'fronhaX_v1')).toHaveLength(1);
  });

  it('mesmo produto/variante comprado por dois caminhos diferentes também mescla', () => {
    const lines = expandStockLines([
      { productId: 'p1', sku: 'p1_v1', quantity: 1 },
      { productId: 'p1', sku: 'p1_v1', quantity: 2 },
    ]);
    expect(lines).toEqual([{ productId: 'p1', sku: 'p1_v1', quantity: 3 }]);
  });

  it('lista vazia retorna lista vazia', () => {
    expect(expandStockLines([])).toEqual([]);
  });
});
