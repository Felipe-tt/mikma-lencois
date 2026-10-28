import { describe, it, expect } from 'vitest';
import { assessRisk, computeFraudSignals, isDisposableEmail, normalizeAddressKey, RISK_HIGH } from './fraudSignals';
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

describe('assessRisk', () => {
  const ctx = (o: Partial<import('./fraudSignals').RiskContext> = {}) => ({
    candidates: [], sameCpfAccounts: 0, cardDeclines24h: 0, isGuest: false, pickup: false, ...o,
  });

  it('pedido comum: risco baixo, sem sinais e sem segurar nada', () => {
    const r = assessRisk(order(), ctx({ accountAgeMs: 30 * 86_400_000, email: 'maria@gmail.com' }));
    expect(r).toEqual({ score: 0, level: 'baixo', signals: [] });
  });

  it('um sinal isolado só pede atenção', () => {
    const r = assessRisk(order(), ctx({ sameCpfAccounts: 1 }));
    expect(r.level).toBe('atencao');
    expect(r.signals[0].reason).toMatch(/CPF já cadastrado em outra conta/);
  });

  it('vários sinais somados: risco alto', () => {
    const r = assessRisk(order({ totalCents: 80000 }), ctx({
      candidates: [order({ id: 'ord_2', userId: 'outra' })],
      cardDeclines24h: 4,
      accountAgeMs: 5 * 60_000,
      email: 'x@mailinator.com',
    }));
    expect(r.level).toBe('alto');
    expect(r.score).toBeGreaterThanOrEqual(RISK_HIGH);
    const reasons = r.signals.map(s => s.reason).join(' | ');
    for (const p of [/Mesmo endereço/, /cartões recusados/, /Conta criada minutos antes/, /temporário/]) expect(reasons).toMatch(p);
  });

  it('conta nova ou convidado só contam em compra de valor alto, e retirada não conta conta nova', () => {
    expect(assessRisk(order({ totalCents: 10000 }), ctx({ accountAgeMs: 60_000, isGuest: true })).signals).toHaveLength(0);
    expect(assessRisk(order({ totalCents: 90000 }), ctx({ accountAgeMs: 60_000, pickup: true })).signals).toHaveLength(0);
    expect(assessRisk(order({ totalCents: 90000 }), ctx({ isGuest: true })).signals[0].reason).toMatch(/convidado/);
  });

  it('cartões recusados: só a partir de 3, e 5+ pesa mais', () => {
    expect(assessRisk(order(), ctx({ cardDeclines24h: 2 })).signals).toHaveLength(0);
    const tres = assessRisk(order(), ctx({ cardDeclines24h: 3 })).score;
    const cinco = assessRisk(order(), ctx({ cardDeclines24h: 5 })).score;
    expect(cinco).toBeGreaterThan(tres);
  });

  it('reconhece e-mail temporário sem pegar provedor comum', () => {
    expect(isDisposableEmail('a@yopmail.com')).toBe(true);
    expect(isDisposableEmail('a@gmail.com')).toBe(false);
    expect(isDisposableEmail(undefined)).toBe(false);
  });
});
