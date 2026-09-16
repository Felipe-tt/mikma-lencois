import { describe, it, expect } from 'vitest';
import { computeExpectedReserved, findReservedMismatches } from './inventoryAudit';

describe('computeExpectedReserved', () => {
  it('soma itens simples de varios pedidos', () => {
    const expected = computeExpectedReserved([
      [{ productId: 'p1', sku: 'p1_a', quantity: 2 }],
      [{ productId: 'p1', sku: 'p1_a', quantity: 3 }, { productId: 'p2', sku: 'p2_b', quantity: 1 }],
    ]);
    expect(expected).toEqual({ p1_a: 5, p2_b: 1 });
  });

  // O bug que motivou reescrever a auditoria: a versao anterior somava
  // item.sku na mao e ignorava o swapSku, entao a fronha trocada aparecia
  // como reserva "sobrando" no inventario, um falso positivo em TODO
  // pedido de Jogo de Cama com troca.
  it('conta o SKU da fronha trocada, nao so o do item principal', () => {
    const expected = computeExpectedReserved([
      [{ productId: 'jogo', sku: 'jogo_casal', quantity: 1, swapSku: 'fronha_malva', swapQtyPerUnit: 2 }],
    ]);
    expect(expected).toEqual({ jogo_casal: 1, fronha_malva: 2 });
  });

  it('multiplica a fronha trocada pela quantidade do item', () => {
    const expected = computeExpectedReserved([
      [{ productId: 'jogo', sku: 'jogo_casal', quantity: 3, swapSku: 'fronha_malva', swapQtyPerUnit: 2 }],
    ]);
    expect(expected.fronha_malva).toBe(6);
  });

  it('mescla quando dois itens trocam pela mesma fronha', () => {
    const expected = computeExpectedReserved([
      [
        { productId: 'jogo', sku: 'jogo_casal', quantity: 1, swapSku: 'fronha_malva', swapQtyPerUnit: 2 },
        { productId: 'jogo', sku: 'jogo_solteiro', quantity: 1, swapSku: 'fronha_malva', swapQtyPerUnit: 2 },
      ],
    ]);
    expect(expected.fronha_malva).toBe(4);
  });

  it('ignora itens sem sku em vez de quebrar', () => {
    const expected = computeExpectedReserved([
      [{ productId: 'p1', sku: '', quantity: 2 }, { productId: 'p2', sku: 'p2_b', quantity: 1 }],
    ]);
    expect(expected).toEqual({ p2_b: 1 });
  });

  it('sem pedidos pendentes, nada deveria estar reservado', () => {
    expect(computeExpectedReserved([])).toEqual({});
  });
});

describe('findReservedMismatches', () => {
  it('nao acusa nada quando bate certinho', () => {
    const mismatches = findReservedMismatches(
      [{ sku: 'p1_a', productId: 'p1', reserved: 5 }],
      { p1_a: 5 }
    );
    expect(mismatches).toEqual([]);
  });

  it('pega reserva presa (sobrando) quando nao ha pedido pendente', () => {
    const mismatches = findReservedMismatches(
      [{ sku: 'p1_a', productId: 'p1', reserved: 3 }],
      {}
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ sku: 'p1_a', currentReserved: 3, expectedReserved: 0, diff: 3 });
  });

  it('pega reserva faltando', () => {
    const mismatches = findReservedMismatches(
      [{ sku: 'p1_a', productId: 'p1', reserved: 1 }],
      { p1_a: 4 }
    );
    expect(mismatches[0]).toMatchObject({ currentReserved: 1, expectedReserved: 4, diff: -3 });
  });

  it('trata reserved ausente como zero', () => {
    const mismatches = findReservedMismatches(
      [{ sku: 'p1_a', productId: 'p1' }],
      { p1_a: 2 }
    );
    expect(mismatches[0]).toMatchObject({ currentReserved: 0, expectedReserved: 2, diff: -2 });
  });

  it('um pedido com fronha trocada nao gera falso positivo na fronha', () => {
    const expected = computeExpectedReserved([
      [{ productId: 'jogo', sku: 'jogo_casal', quantity: 1, swapSku: 'fronha_malva', swapQtyPerUnit: 2 }],
    ]);
    // O inventario reflete a reserva real feita no checkout: 1 jogo + 2 fronhas.
    const mismatches = findReservedMismatches(
      [
        { sku: 'jogo_casal', productId: 'jogo', reserved: 1 },
        { sku: 'fronha_malva', productId: 'fronha', reserved: 2 },
      ],
      expected
    );
    expect(mismatches).toEqual([]);
  });
});
