import { describe, expect, it } from 'vitest';
import { STORE_DEFAULTS, withStoreDefaults } from './store-settings';

describe('origem dos produtos (CDC, art. 31)', () => {
  it('é Brasil por padrão', () => {
    expect(STORE_DEFAULTS.productOrigin).toBe('Brasil');
    expect(withStoreDefaults(undefined).productOrigin).toBe('Brasil');
    expect(withStoreDefaults({ storeName: 'Mikma' }).productOrigin).toBe('Brasil');
  });

  it('salva vazia (antes do padrão existir) volta para Brasil', () => {
    expect(withStoreDefaults({ productOrigin: '' }).productOrigin).toBe('Brasil');
    expect(withStoreDefaults({ productOrigin: '  ' }).productOrigin).toBe('Brasil');
  });

  it('respeita o que a loja escreveu', () => {
    expect(withStoreDefaults({ productOrigin: 'Brasil (Blumenau/SC)' }).productOrigin).toBe('Brasil (Blumenau/SC)');
  });
});
