import { describe, expect, it } from 'vitest';
import { applyNavOrder, moveItem } from './navOrder';

const NAV = ['/a', '/b', '/c', '/d'].map(href => ({ href }));
const hrefs = (l: { href: string }[]) => l.map(i => i.href);

describe('applyNavOrder', () => {
  it('sem ordem salva, mantém o padrão', () => {
    expect(hrefs(applyNavOrder(NAV, null))).toEqual(['/a', '/b', '/c', '/d']);
  });
  it('aplica a ordem salva', () => {
    expect(hrefs(applyNavOrder(NAV, ['/d', '/c', '/b', '/a']))).toEqual(['/d', '/c', '/b', '/a']);
  });
  it('item novo entra na posição padrão e item removido some', () => {
    expect(hrefs(applyNavOrder(NAV, ['/c', '/a', '/x']))).toEqual(['/c', '/b', '/a', '/d']);
  });
});

describe('moveItem', () => {
  it('sobe e desce itens', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('limita o destino ao tamanho da lista', () => {
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
  });
});
