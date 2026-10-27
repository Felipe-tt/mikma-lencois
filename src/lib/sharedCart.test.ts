import { describe, it, expect } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { CartItem } from '@/types';
import { applySharedOp, lineKey, MAX_SHARED_LINES, MAX_SHARED_QTY, TOKEN_RE } from './sharedCart';

type Docs = Record<string, Record<string, Record<string, unknown>>>;

/** Firestore falso: só collection(x).doc(y).get(). */
function fakeDb(docs: Docs): Firestore {
  return {
    collection: (c: string) => ({
      doc: (id: string) => ({
        get: async () => ({ id, exists: !!docs[c]?.[id], data: () => docs[c]?.[id] }),
      }),
    }),
  } as unknown as Firestore;
}

const variant = { id: 'v1', size: 'queen', color: 'Branco' };
const lencol = { name: 'Lençol Queen', price: 120, category: 'Lençóis', images: ['a.jpg'], variants: [variant] };
const jogo = { name: 'Jogo Queen', price: 300, category: 'Jogos de cama', fronhaCount: 2, images: [], variants: [variant] };
const fronha = { name: 'Fronha Rosa', price: 40, category: 'Fronhas', images: [], variants: [{ id: 'f1', size: 'unico', color: 'Rosa' }] };

const stock = { lencol_v1: { quantity: 50 }, jogo_v1: { quantity: 50 }, fronha_f1: { quantity: 50 } };
const base: Docs = { products: { lencol, jogo, fronha, inativo: { ...lencol, active: false } }, inventory: stock };
const item = (over: Partial<CartItem> = {}): CartItem =>
  ({ productId: 'lencol', productName: 'Lençol Queen', sku: 'lencol_v1', variant, quantity: 1, unitPrice: 120, image: 'a.jpg', ...over }) as CartItem;

describe('applySharedOp: add', () => {
  it('monta o item com preço e nome do banco', async () => {
    const r = await applySharedOp(fakeDb(base), [], { op: 'add', productId: 'lencol', variantId: 'v1' });
    expect(r).toEqual({ items: [expect.objectContaining({ sku: 'lencol_v1', unitPrice: 120, productName: 'Lençol Queen', quantity: 1 })], text: 'adicionou Lençol Queen' });
  });

  it('soma na linha que já existe', async () => {
    const r = await applySharedOp(fakeDb(base), [item()], { op: 'add', productId: 'lencol', variantId: 'v1' });
    expect('items' in r && r.items).toEqual([expect.objectContaining({ quantity: 2 })]);
  });

  it('recusa produto inativo, inexistente, variante errada ou id estranho', async () => {
    for (const [productId, variantId] of [['inativo', 'v1'], ['nada', 'v1'], ['lencol', 'x'], ['../x', 'v1']]) {
      expect(await applySharedOp(fakeDb(base), [], { op: 'add', productId, variantId })).toEqual({ error: 'Produto indisponível.' });
    }
  });

  it('respeita o estoque livre (quantidade menos reservado)', async () => {
    const db = fakeDb({ ...base, inventory: { ...stock, lencol_v1: { quantity: 3, reserved: 2 } } });
    expect(await applySharedOp(db, [item()], { op: 'add', productId: 'lencol', variantId: 'v1' })).toEqual({ error: 'Sem mais unidades em estoque.' });
  });

  it('trata variação sem estoque cadastrado como esgotada', async () => {
    const db = fakeDb({ ...base, inventory: {} });
    expect(await applySharedOp(db, [], { op: 'add', productId: 'lencol', variantId: 'v1' })).toEqual({ error: 'Sem mais unidades em estoque.' });
  });

  it('limita linhas e quantidade', async () => {
    const full = Array.from({ length: MAX_SHARED_LINES }, (_, n) => item({ sku: `p${n}_v1` }));
    expect(await applySharedOp(fakeDb(base), full, { op: 'add', productId: 'lencol', variantId: 'v1' })).toEqual({ error: 'O carrinho já está cheio.' });
    expect(await applySharedOp(fakeDb(base), [item({ quantity: MAX_SHARED_QTY })], { op: 'add', productId: 'lencol', variantId: 'v1' })).toEqual({ error: 'Sem mais unidades em estoque.' });
  });
});

describe('applySharedOp: qty', () => {
  it('muda a quantidade e tira com zero', async () => {
    const db = fakeDb(base);
    const r = await applySharedOp(db, [item()], { op: 'qty', line: 'lencol_v1', quantity: 3 });
    expect('items' in r && r.items[0].quantity).toBe(3);
    expect(await applySharedOp(db, [item()], { op: 'qty', line: 'lencol_v1', quantity: 0 })).toEqual({ items: [], text: 'tirou Lençol Queen' });
  });

  it('recusa quantidade inválida e linha que já saiu', async () => {
    const db = fakeDb(base);
    for (const quantity of [-1, 1.5, MAX_SHARED_QTY + 1]) {
      expect(await applySharedOp(db, [item()], { op: 'qty', line: 'lencol_v1', quantity })).toEqual({ error: 'Quantidade inválida.' });
    }
    expect(await applySharedOp(db, [], { op: 'qty', line: 'lencol_v1', quantity: 1 })).toEqual({ error: 'Esse item já saiu do carrinho.' });
  });

  it('só confere estoque quando aumenta', async () => {
    const db = fakeDb({ ...base, inventory: { ...stock, lencol_v1: { quantity: 1 } } });
    expect(await applySharedOp(db, [item({ quantity: 1 })], { op: 'qty', line: 'lencol_v1', quantity: 2 })).toEqual({ error: 'Sem mais unidades em estoque.' });
    expect('items' in await applySharedOp(db, [item({ quantity: 3 })], { op: 'qty', line: 'lencol_v1', quantity: 2 })).toBe(true);
  });
});

describe('applySharedOp: swap', () => {
  const j = item({ productId: 'jogo', productName: 'Jogo Queen', sku: 'jogo_v1', quantity: 2 });

  it('troca a fronha de um jogo de cama', async () => {
    const r = await applySharedOp(fakeDb(base), [j], { op: 'swap', line: 'jogo_v1', swapSku: 'fronha_f1' });
    expect(r).toEqual({ items: [expect.objectContaining({ swapSku: 'fronha_f1', swapQtyPerUnit: 2, note: 'Fronha trocada: Fronha Rosa' })], text: 'trocou a fronha de Jogo Queen' });
    if ('items' in r) expect(lineKey(r.items[0])).toBe('jogo_v1::Fronha trocada: Fronha Rosa');
  });

  it('volta para a fronha padrão e junta com a linha igual', async () => {
    const trocado = { ...j, quantity: 1, swapSku: 'fronha_f1', swapQtyPerUnit: 2, note: 'Fronha trocada: Fronha Rosa' };
    const r = await applySharedOp(fakeDb(base), [j, trocado], { op: 'swap', line: lineKey(trocado), swapSku: null });
    expect('items' in r && r.items).toEqual([expect.objectContaining({ sku: 'jogo_v1', quantity: 3 })]);
    if ('items' in r) expect(r.items[0].swapSku).toBeUndefined();
  });

  it('recusa fora de jogo de cama, fronha inválida ou sem estoque', async () => {
    expect(await applySharedOp(fakeDb(base), [item()], { op: 'swap', line: 'lencol_v1', swapSku: 'fronha_f1' })).toEqual({ error: 'Esse item não tem troca de fronha.' });
    expect(await applySharedOp(fakeDb(base), [j], { op: 'swap', line: 'jogo_v1', swapSku: 'lencol_v1' })).toEqual({ error: 'Fronha indisponível.' });
    const db = fakeDb({ ...base, inventory: { ...stock, fronha_f1: { quantity: 3 } } });
    expect(await applySharedOp(db, [j], { op: 'swap', line: 'jogo_v1', swapSku: 'fronha_f1' })).toEqual({ error: 'Essa fronha está sem estoque.' });
  });
});

describe('TOKEN_RE', () => {
  it('aceita só tokens de 22 caracteres url-safe', () => {
    expect(TOKEN_RE.test('abcdefghij_-KLMNOPQRST')).toBe(true);
    expect(TOKEN_RE.test('curto')).toBe(false);
    expect(TOKEN_RE.test('abcdefghij/-KLMNOPQRST')).toBe(false);
  });
});
