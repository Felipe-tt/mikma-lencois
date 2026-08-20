import { describe, it, expect } from 'vitest';
import { isValidCartQuantity } from './security';

describe('isValidCartQuantity', () => {
  it('aceita inteiros positivos dentro do limite', () => {
    expect(isValidCartQuantity(1)).toBe(true);
    expect(isValidCartQuantity(5)).toBe(true);
    expect(isValidCartQuantity(50)).toBe(true);
  });

  it('CRÍTICO: rejeita quantidade negativa (vetor de fraude de pagamento)', () => {
    expect(isValidCartQuantity(-1)).toBe(false);
    expect(isValidCartQuantity(-999)).toBe(false);
  });

  it('rejeita zero', () => {
    expect(isValidCartQuantity(0)).toBe(false);
  });

  it('rejeita acima do limite máximo', () => {
    expect(isValidCartQuantity(51)).toBe(false);
    expect(isValidCartQuantity(999999)).toBe(false);
  });

  it('rejeita não-inteiro', () => {
    expect(isValidCartQuantity(1.5)).toBe(false);
    expect(isValidCartQuantity(2.0001)).toBe(false);
  });

  it('rejeita NaN e Infinity', () => {
    expect(isValidCartQuantity(NaN)).toBe(false);
    expect(isValidCartQuantity(Infinity)).toBe(false);
    expect(isValidCartQuantity(-Infinity)).toBe(false);
  });

  it('rejeita tipos que não são number (string, null, undefined, objeto)', () => {
    expect(isValidCartQuantity('5')).toBe(false);
    expect(isValidCartQuantity(null)).toBe(false);
    expect(isValidCartQuantity(undefined)).toBe(false);
    expect(isValidCartQuantity({})).toBe(false);
    expect(isValidCartQuantity([5])).toBe(false);
  });
});
