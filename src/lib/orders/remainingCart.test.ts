import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/firebase/admin', () => ({ adminDb: {}, adminAuth: {} }));
import { remainingCartItems } from './confirmPayment';

describe('remainingCartItems', () => {
  it('tira só o que foi comprado', () => {
    const cart = [{ sku: 'a_1', quantity: 2 }, { sku: 'b_1', quantity: 1 }];
    expect(remainingCartItems(cart, [{ sku: 'a_1', quantity: 2 }])).toEqual([{ sku: 'b_1', quantity: 1 }]);
  });
  it('mantém a quantidade que o cliente aumentou depois', () => {
    expect(remainingCartItems([{ sku: 'a_1', quantity: 3 }], [{ sku: 'a_1', quantity: 1 }])).toEqual([{ sku: 'a_1', quantity: 2 }]);
  });
  it('desconta entre linhas do mesmo SKU (fronhas diferentes)', () => {
    const cart = [{ sku: 'j_1', quantity: 1, note: 'x' }, { sku: 'j_1', quantity: 1, note: 'y' }];
    expect(remainingCartItems(cart, [{ sku: 'j_1', quantity: 2 }])).toEqual([]);
  });
  it('carrinho igual ao pedido fica vazio', () => {
    expect(remainingCartItems([{ sku: 'a_1', quantity: 1 }], [{ sku: 'a_1', quantity: 1 }])).toEqual([]);
  });
});
