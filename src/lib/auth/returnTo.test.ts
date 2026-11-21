import { describe, expect, it } from 'vitest';
import { internalPath } from './returnTo';

const ORIGIN = 'https://mikma.com.br';

describe('volta depois do login: só caminho do próprio site', () => {
  it('aceita caminho interno, com busca e âncora', () => {
    expect(internalPath('/carrinho', ORIGIN)).toBe('/carrinho');
    expect(internalPath('/produtos?q=lencol#avaliacoes', ORIGIN)).toBe('/produtos?q=lencol#avaliacoes');
    expect(internalPath('/pedidos/ord_0123456789abcdef', ORIGIN)).toBe('/pedidos/ord_0123456789abcdef');
  });

  it('recusa o que o navegador abriria em outro domínio', () => {
    for (const evil of ['//evil.com', '/\\evil.com', '/\\/evil.com', '/\t/evil.com', '/\n/evil.com', 'https://evil.com', 'javascript:alert(1)', 'evil.com', '']) {
      expect(internalPath(evil, ORIGIN), JSON.stringify(evil)).toBeNull();
    }
    expect(internalPath(null, ORIGIN)).toBeNull();
    expect(internalPath(undefined, ORIGIN)).toBeNull();
  });
});
