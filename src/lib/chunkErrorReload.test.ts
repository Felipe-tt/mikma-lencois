import { describe, it, expect } from 'vitest';
import { isChunkError } from './chunkErrorReload';

describe('isChunkError', () => {
  it('reconhece o formato de erro do Webpack', () => {
    expect(isChunkError('ChunkLoadError: Loading chunk 123 failed.')).toBe(true);
    expect(isChunkError(new Error('Loading chunk 42 failed'))).toBe(true);
  });

  it('CRÍTICO: reconhece o formato específico do Turbopack (Sentry JAVASCRIPT-NEXTJS-A)', () => {
    // Mensagem exata vista em produção
    expect(isChunkError(
      'Module 835506 was instantiated because it was required from module 417689, but the module factory is not available.'
    )).toBe(true);
  });

  it('reconhece falha de import dinâmico', () => {
    expect(isChunkError('Failed to fetch dynamically imported module: /_next/static/chunks/foo.js')).toBe(true);
    expect(isChunkError('error loading dynamically imported module')).toBe(true);
  });

  it('não reconhece erros comuns não relacionados a chunk', () => {
    expect(isChunkError('Cannot read properties of undefined (reading \'toLowerCase\')')).toBe(false);
    expect(isChunkError(new Error('Network request failed'))).toBe(false);
    expect(isChunkError('TypeError: x is not a function')).toBe(false);
  });

  it('lida bem com entrada vazia/nula/indefinida', () => {
    expect(isChunkError(undefined)).toBe(false);
    expect(isChunkError(null)).toBe(false);
    expect(isChunkError('')).toBe(false);
  });

  it('aceita tanto string quanto objeto Error com .message', () => {
    const err = new Error('Cannot find module ./foo from bar');
    expect(isChunkError(err)).toBe(true);
    expect(isChunkError(err.message)).toBe(true);
  });
});
