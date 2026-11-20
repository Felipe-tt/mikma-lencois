import { describe, expect, it } from 'vitest';
import { withCurrentPrices } from './cartPrices';
import type { CartItem } from '@/types';

const item = (productId: string, unitPrice: number, sku = `${productId}_v1`): CartItem => ({
  productId, productName: `Produto ${productId}`, sku, variant: { id: 'v1', size: 'casal' } as CartItem['variant'], quantity: 1, unitPrice, image: '',
});

describe('preço atual no carrinho', () => {
  it('sem mudança, nada a gravar', () => {
    expect(withCurrentPrices([item('p1', 1000)], new Map([['p1', 1000]]))).toBeNull();
    expect(withCurrentPrices([item('p1', 1000)], new Map())).toBeNull();
  });

  it('troca o preço e diz o que mudou (uma vez por produto)', () => {
    const r = withCurrentPrices([item('p1', 1000), item('p1', 1000, 'p1_v2'), item('p2', 500)], new Map([['p1', 1200], ['p2', 500]]));
    expect(r?.items.map(i => i.unitPrice)).toEqual([1200, 1200, 500]);
    expect(r?.changes).toEqual([{ productName: 'Produto p1', from: 1000, to: 1200 }]);
  });

  it('ignora preço inválido no cadastro (o servidor recusa a venda)', () => {
    expect(withCurrentPrices([item('p1', 1000)], new Map([['p1', 0]]))).toBeNull();
    expect(withCurrentPrices([item('p1', 1000)], new Map([['p1', 10.5]]))).toBeNull();
  });
});
