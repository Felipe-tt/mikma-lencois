import { describe, it, expect } from 'vitest';
import {
  parseConsent,
  trackingCookieDomains,
  CONSENT_VERSION,
  CONSENT_TTL_MS,
} from './cookie-consent';

const NOW = 1_800_000_000_000;
const stored = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ v: CONSENT_VERSION, analytics: true, at: NOW - 1000, ...over });

describe('parseConsent', () => {
  it('sem valor salvo: unset', () => {
    expect(parseConsent(null, NOW)).toBe('unset');
    expect(parseConsent('', NOW)).toBe('unset');
  });

  it('aceite e recusa válidos', () => {
    expect(parseConsent(stored({ analytics: true }), NOW)).toBe('granted');
    expect(parseConsent(stored({ analytics: false }), NOW)).toBe('denied');
  });

  it('escolha vencida (mais de 12 meses) volta a unset', () => {
    expect(parseConsent(stored({ at: NOW - CONSENT_TTL_MS + 1000 }), NOW)).toBe('granted');
    expect(parseConsent(stored({ at: NOW - CONSENT_TTL_MS - 1 }), NOW)).toBe('unset');
  });

  it('versão diferente força nova pergunta', () => {
    expect(parseConsent(stored({ v: CONSENT_VERSION + 1 }), NOW)).toBe('unset');
    expect(parseConsent(stored({ v: undefined }), NOW)).toBe('unset');
  });

  it('valores inválidos ou adulterados viram unset (nunca granted)', () => {
    expect(parseConsent('{', NOW)).toBe('unset');
    expect(parseConsent('"granted"', NOW)).toBe('unset');
    expect(parseConsent(stored({ analytics: 'true' }), NOW)).toBe('unset');
    expect(parseConsent(stored({ at: 'hoje' }), NOW)).toBe('unset');
    expect(parseConsent(stored({ at: NOW + 24 * 60 * 60 * 1000 }), NOW)).toBe('unset');
  });
});

describe('trackingCookieDomains', () => {
  it('lista do domínio mais específico ao mais amplo', () => {
    expect(trackingCookieDomains('www.mikma.com.br')).toEqual([
      '.www.mikma.com.br',
      '.mikma.com.br',
      '.com.br',
    ]);
    expect(trackingCookieDomains('mikma.com.br')).toEqual(['.mikma.com.br', '.com.br']);
  });

  it('localhost, IPv4 e IPv6 não têm domínio de cookie', () => {
    expect(trackingCookieDomains('localhost')).toEqual([]);
    expect(trackingCookieDomains('127.0.0.1')).toEqual([]);
    expect(trackingCookieDomains('::1')).toEqual([]);
    expect(trackingCookieDomains('')).toEqual([]);
  });
});
