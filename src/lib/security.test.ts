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

describe('isPlausibleIp / getClientIp (rate limit por IP)', async () => {
  const { isPlausibleIp, getClientIp } = await import('./security');
  const { NextRequest } = await import('next/server');
  const req = (h: Record<string, string>) => new NextRequest('http://x/', { headers: h });

  it('aceita IPv4 e IPv6 válidos', () => {
    expect(isPlausibleIp('189.1.2.3')).toBe(true);
    expect(isPlausibleIp('2804:14d:1234::1')).toBe(true);
  });

  it('rejeita lixo e IPv4 fora de faixa', () => {
    expect(isPlausibleIp('999.1.1.1')).toBe(false);
    expect(isPlausibleIp('<script>')).toBe(false);
    expect(isPlausibleIp('a'.repeat(100))).toBe(false);
    expect(isPlausibleIp('')).toBe(false);
  });

  it('usa fastly-client-ip só quando válido; senão cai no x-forwarded-for', () => {
    expect(getClientIp(req({ 'fastly-client-ip': '189.1.2.3' }))).toBe('189.1.2.3');
    expect(getClientIp(req({ 'fastly-client-ip': 'lixo-arbitrario', 'x-forwarded-for': '1.1.1.1, 8.8.8.8' }))).toBe('8.8.8.8');
  });
});
