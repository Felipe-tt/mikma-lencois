import { describe, it, expect } from 'vitest';
import { computeFraudSignals, normalizeAddressKey } from './fraudSignals';
import type { Address } from '@/types';

const addr = (overrides: Partial<Address> = {}): Address => ({
  cep: '89050-000',
  street: 'Rua das Flores',
  number: '100',
  neighborhood: 'Centro',
  city: 'Blumenau',
  state: 'SC',
  ...overrides,
});

const order = (overrides: Partial<Parameters<typeof computeFraudSignals>[0]> = {}) => ({
  id: 'ord_1',
  userId: 'user1',
  address: addr(),
  totalCents: 10000,
  clientIp: '1.2.3.4',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('normalizeAddressKey', () => {
  it('trata maiúscula/minúscula e espaço extra como o mesmo endereço', () => {
    const a = normalizeAddressKey(addr({ complement: 'Apto  201' }));
    const b = normalizeAddressKey(addr({ complement: '  apto 201' }));
    expect(a).toBe(b);
  });

  it('CEP diferente gera chave diferente', () => {
    const a = normalizeAddressKey(addr({ cep: '89050-000' }));
    const b = normalizeAddressKey(addr({ cep: '89050-001' }));
    expect(a).not.toBe(b);
  });
});

describe('computeFraudSignals', () => {
  it('sem pedidos relacionados, nenhum sinal', () => {
    expect(computeFraudSignals(order(), [])).toEqual([]);
  });

  it('ignora o próprio pedido na lista de candidatos', () => {
    const o = order();
    expect(computeFraudSignals(o, [o])).toEqual([]);
  });

  it('mesmo endereço, mesmo usuário (recompra): não sinaliza', () => {
    const o = order({ id: 'ord_2', userId: 'user1' });
    const prev = order({ id: 'ord_1', userId: 'user1' });
    expect(computeFraudSignals(o, [prev])).toEqual([]);
  });

  it('mesmo endereço, usuário diferente: sinaliza', () => {
    const o = order({ id: 'ord_2', userId: 'user2' });
    const prev = order({ id: 'ord_1', userId: 'user1' });
    const signals = computeFraudSignals(o, [prev]);
    expect(signals).toHaveLength(1);
    expect(signals[0].reason).toMatch(/mesmo endereço/i);
    expect(signals[0].relatedOrderIds).toEqual(['ord_1']);
  });

  it('endereço diferente, usuário diferente: não sinaliza por endereço', () => {
    const o = order({ id: 'ord_2', userId: 'user2', address: addr({ number: '999' }) });
    const prev = order({ id: 'ord_1', userId: 'user1' });
    expect(computeFraudSignals(o, [prev])).toEqual([]);
  });

  it('mesmo IP, usuário diferente, mas valor baixo dos dois lados: não sinaliza', () => {
    const o = order({ id: 'ord_2', userId: 'user2', totalCents: 5000, address: addr({ number: '999' }) });
    const prev = order({ id: 'ord_1', userId: 'user1', totalCents: 5000, address: addr({ number: '888' }) });
    expect(computeFraudSignals(o, [prev])).toEqual([]);
  });

  it('mesmo IP, usuário diferente, pedido atual de valor alto: sinaliza', () => {
    const o = order({ id: 'ord_2', userId: 'user2', totalCents: 60000, address: addr({ number: '999' }) });
    const prev = order({ id: 'ord_1', userId: 'user1', totalCents: 5000, address: addr({ number: '888' }) });
    const signals = computeFraudSignals(o, [prev]);
    expect(signals).toHaveLength(1);
    expect(signals[0].reason).toMatch(/mesmo ip/i);
  });

  it('mesmo IP, usuário diferente, pedido relacionado de valor alto: sinaliza', () => {
    const o = order({ id: 'ord_2', userId: 'user2', totalCents: 5000, address: addr({ number: '999' }) });
    const prev = order({ id: 'ord_1', userId: 'user1', totalCents: 60000, address: addr({ number: '888' }) });
    const signals = computeFraudSignals(o, [prev]);
    expect(signals).toHaveLength(1);
  });

  it('sem clientIp no pedido atual: não sinaliza por IP', () => {
    const o = order({ id: 'ord_2', userId: 'user2', clientIp: undefined, totalCents: 60000, address: addr({ number: '999' }) });
    const prev = order({ id: 'ord_1', userId: 'user1', totalCents: 60000, address: addr({ number: '888' }) });
    expect(computeFraudSignals(o, [prev])).toEqual([]);
  });

  it('endereço E ip batendo com contas diferentes: retorna os dois sinais', () => {
    const o = order({ id: 'ord_2', userId: 'user2', totalCents: 60000 });
    const prev = order({ id: 'ord_1', userId: 'user1', totalCents: 5000 });
    const signals = computeFraudSignals(o, [prev]);
    expect(signals).toHaveLength(2);
  });

  it('múltiplas contas no mesmo endereço: lista todos os pedidos relacionados', () => {
    const o = order({ id: 'ord_3', userId: 'user3' });
    const prev1 = order({ id: 'ord_1', userId: 'user1' });
    const prev2 = order({ id: 'ord_2', userId: 'user2' });
    const signals = computeFraudSignals(o, [prev1, prev2]);
    expect(signals[0].relatedOrderIds.sort()).toEqual(['ord_1', 'ord_2']);
  });
});
