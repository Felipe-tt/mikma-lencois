import { describe, it, expect } from 'vitest';
import { carrierName, carrierNameVendor, trackingUrl, isCorreios, normalizeTrackingCode, isCorreiosTrackingCode } from './carriers';

describe('carrierName', () => {
  it('retorna nome amigável pro cliente', () => {
    expect(carrierName('uber_direct')).toBe('Entrega expressa');
    expect(carrierName('correios_sedex')).toBe('Correios SEDEX');
  });
  it('faz fallback formatando a chave quando desconhecida', () => {
    expect(carrierName('transportadora_nova')).toBe('transportadora nova');
  });
});

describe('carrierNameVendor', () => {
  it('usa o nome técnico quando existe', () => {
    expect(carrierNameVendor('uber_direct')).toBe('Uber Direct');
  });
  it('cai pro nome padrão quando não tem nameVendor específico', () => {
    expect(carrierNameVendor('correios_pac')).toBe('Correios PAC');
  });
});

describe('trackingUrl', () => {
  it('monta a URL dos Correios a partir do código', () => {
    expect(trackingUrl('correios_sedex', 'AA123456789BR'))
      .toBe('https://rastreamento.correios.com.br/app/index.php?objetos=AA123456789BR');
  });

  it('Uber Direct: repassa a URL recebida se já for uma URL', () => {
    const url = 'https://track.uber.com/abc123';
    expect(trackingUrl('uber_direct', url)).toBe(url);
  });

  it('Uber Direct: retorna null se o "code" não for uma URL (ex: ainda não despachado)', () => {
    expect(trackingUrl('uber_direct', 'algum-id-interno')).toBeNull();
  });

  it('retorna null para carriers sem rastreio (pickup, manual)', () => {
    expect(trackingUrl('pickup', 'qualquer')).toBeNull();
    expect(trackingUrl('manual', 'qualquer')).toBeNull();
  });

  it('retorna null quando não há código', () => {
    expect(trackingUrl('correios_sedex', '')).toBeNull();
  });
});

describe('isCorreios', () => {
  it('identifica PAC e SEDEX como Correios', () => {
    expect(isCorreios('correios_pac')).toBe(true);
    expect(isCorreios('correios_sedex')).toBe(true);
  });
  it('não confunde outras transportadoras com Correios', () => {
    expect(isCorreios('jadlog_package')).toBe(false);
    expect(isCorreios('uber_direct')).toBe(false);
  });
});

describe('normalizeTrackingCode', () => {
  it('deixa em maiúsculas', () => {
    expect(normalizeTrackingCode('aa123456789br')).toBe('AA123456789BR');
  });
  it('remove espaço no meio do código (era o caso que escapava da detecção)', () => {
    expect(normalizeTrackingCode('AA 123456789 BR')).toBe('AA123456789BR');
  });
  it('remove traço e pontuação', () => {
    expect(normalizeTrackingCode('AA-123456789-BR')).toBe('AA123456789BR');
  });
  it('remove espaço nas pontas', () => {
    expect(normalizeTrackingCode('  AA123456789BR  ')).toBe('AA123456789BR');
  });
});

describe('isCorreiosTrackingCode', () => {
  it('reconhece o formato padrão dos Correios (AA123456789BR)', () => {
    expect(isCorreiosTrackingCode('AA123456789BR')).toBe(true);
  });
  it('reconhece mesmo colado com espaço, minúsculo ou traço (bug original: SEDEX travava)', () => {
    expect(isCorreiosTrackingCode('aa 123456789 br')).toBe(true);
    expect(isCorreiosTrackingCode('AA-123456789-BR')).toBe(true);
  });
  it('rejeita um orderId do Firestore (não é formato Correios)', () => {
    expect(isCorreiosTrackingCode('aB3xY9zQwErT1u2VpL8n')).toBe(false);
  });
  it('rejeita string vazia ou tamanho errado', () => {
    expect(isCorreiosTrackingCode('')).toBe(false);
    expect(isCorreiosTrackingCode('AA123BR')).toBe(false);
  });
});
