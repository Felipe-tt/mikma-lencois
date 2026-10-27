import { describe, it, expect } from 'vitest';
import { isValidCartQuantity } from './security';
import { isValidCart, MAX_CART_LINES } from './security';

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

  it('usa o x-fah-client-ip do App Hosting e ignora o fastly-client-ip forjável', () => {
    expect(getClientIp(req({ 'x-fah-client-ip': '189.1.2.3', 'fastly-client-ip': '6.6.6.6' }))).toBe('189.1.2.3');
    expect(getClientIp(req({ 'fastly-client-ip': '6.6.6.6', 'x-forwarded-for': '1.1.1.1, 8.8.8.8' }))).toBe('8.8.8.8');
    expect(getClientIp(req({ 'x-fah-client-ip': 'lixo', 'x-forwarded-for': '8.8.8.8' }))).toBe('8.8.8.8');
  });

  it('cf-connecting-ip só vale com o segredo da Cloudflare', () => {
    const prev = process.env.EDGE_SHARED_SECRET;
    process.env.EDGE_SHARED_SECRET = 'segredo-123';
    try {
      expect(getClientIp(req({ 'cf-connecting-ip': '200.1.1.1', 'x-mikma-edge': 'segredo-123', 'x-fah-client-ip': '172.70.0.1' }))).toBe('200.1.1.1');
      expect(getClientIp(req({ 'cf-connecting-ip': '200.1.1.1', 'x-mikma-edge': 'errado-123', 'x-fah-client-ip': '172.70.0.1' }))).toBe('172.70.0.1');
    } finally {
      if (prev === undefined) delete process.env.EDGE_SHARED_SECRET; else process.env.EDGE_SHARED_SECRET = prev;
    }
  });
});

describe('isValidCart', () => {
  const line = { sku: 'abc_queen_algodão', productId: 'abc', quantity: 2 };
  it('aceita carrinho normal, inclusive SKU com acento', () => {
    expect(isValidCart([line, { ...line, sku: 'abc_v1', swapSku: 'fr_v1' }])).toBe(true);
  });
  it('recusa id que derrubaria a leitura no Firestore', () => {
    expect(isValidCart([{ ...line, productId: 'a/b' }])).toBe(false);
    expect(isValidCart([{ ...line, sku: '__x__' }])).toBe(false);
    expect(isValidCart([{ ...line, swapSku: '..' }])).toBe(false);
  });
  it('recusa vazio, quantidade inválida e linhas demais', () => {
    expect(isValidCart([])).toBe(false);
    expect(isValidCart([{ ...line, quantity: -1 }])).toBe(false);
    expect(isValidCart(Array.from({ length: MAX_CART_LINES + 1 }, () => line))).toBe(false);
  });
});
