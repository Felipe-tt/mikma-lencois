import { describe, it, expect } from 'vitest';
import { maintenanceDocId, pathOnly, safeReferer, clip } from './maintenanceQueue';

describe('maintenanceDocId', () => {
  it('gera 64 hex, estável e diferente por IP e por segredo', async () => {
    const a = await maintenanceDocId('189.1.2.3', 'segredo');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await maintenanceDocId('189.1.2.3', 'segredo')).toBe(a);
    expect(await maintenanceDocId('189.1.2.4', 'segredo')).not.toBe(a);
    expect(await maintenanceDocId('189.1.2.3', 'outro')).not.toBe(a);
  });

  it('não revela o IP e funciona para IPv6 e sem segredo (fallback)', async () => {
    const id = await maintenanceDocId('2804:14d::1');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain('2804');
  });
});

describe('pathOnly (token em query string nunca é gravado)', () => {
  it('remove query e hash', () => {
    expect(pathOnly('/redefinir-senha?email=a@b.com&token=SEGREDO')).toBe('/redefinir-senha');
    expect(pathOnly('/confirmar-email?token=X#y')).toBe('/confirmar-email');
    expect(pathOnly('/produtos/lencol')).toBe('/produtos/lencol');
  });
  it('limita o tamanho', () => {
    expect(pathOnly('/' + 'a'.repeat(500))).toHaveLength(200);
  });
});

describe('safeReferer', () => {
  it('mantém origem e caminho, descarta query e hash', () => {
    expect(safeReferer('https://mikma.com.br/redefinir-senha?token=SEGREDO#x')).toBe(
      'https://mikma.com.br/redefinir-senha',
    );
  });
  it('vazio, nulo e inválido viram string vazia', () => {
    expect(safeReferer(null)).toBe('');
    expect(safeReferer('')).toBe('');
    expect(safeReferer('não é url')).toBe('');
  });
});

describe('clip', () => {
  it('corta no máximo informado e tolera nulo', () => {
    expect(clip('abcdef', 3)).toBe('abc');
    expect(clip(null, 3)).toBe('');
  });
});
