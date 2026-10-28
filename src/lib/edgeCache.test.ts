import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { edgeHtmlCache } from './edgeCache';

const req = (url: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`https://mikma.com.br${url}`, init);

describe('edgeHtmlCache', () => {
  it('guarda o HTML das páginas públicas', () => {
    expect(edgeHtmlCache(req('/produtos/p1'), false)).toBe('public, max-age=120, stale-while-revalidate=600');
    expect(edgeHtmlCache(req('/', { method: 'HEAD' }), false)).toMatch(/^public/);
  });

  it('não guarda em manutenção', () => {
    expect(edgeHtmlCache(req('/'), true)).toBe('no-store');
  });

  it('não guarda o que não é leitura', () => {
    expect(edgeHtmlCache(req('/', { method: 'POST' }), false)).toBe('no-store');
  });

  it('não guarda para staff logado', () => {
    expect(edgeHtmlCache(req('/', { headers: { cookie: '__session=abc' } }), false)).toBe('no-store');
  });
});
