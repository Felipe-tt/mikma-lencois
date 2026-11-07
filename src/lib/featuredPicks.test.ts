import { describe, it, expect } from 'vitest';
import { pickFeatured, weekSeed } from './featuredPicks';

const mk = (id: string, category: string, size: string) => ({ id, category, variants: [{ size }] });

// Catálogo do mais novo para o mais antigo: as últimas entradas foram fronhas.
const catalog = [
  ...Array.from({ length: 12 }, (_, i) => mk(`f${i}`, 'Fronhas', 'unico')),
  ...['solteiro', 'casal', 'queen', 'king'].flatMap(sz => Array.from({ length: 6 }, (_, i) => mk(`j-${sz}-${i}`, 'Jogos de cama', sz))),
];

describe('escolhas da semana', () => {
  it('não mostra só fronhas: no máximo 2', () => {
    const picks = pickFeatured(catalog, 8, 100);
    expect(picks).toHaveLength(8);
    expect(picks.filter(p => p.category === 'Fronhas')).toHaveLength(2);
  });

  it('jogos de cama com tamanhos variados', () => {
    const jogos = pickFeatured(catalog, 8, 100).filter(p => p.category === 'Jogos de cama');
    expect(new Set(jogos.map(p => p.variants[0].size)).size).toBe(4);
  });

  it('começa por um jogo de cama e não repete produto', () => {
    const picks = pickFeatured(catalog, 8, 7);
    expect(picks[0].category).toBe('Jogos de cama');
    expect(new Set(picks.map(p => p.id)).size).toBe(8);
  });

  it('igual durante a semana, muda na seguinte', () => {
    const seg = new Date('2026-11-09T12:00:00Z'), dom = new Date('2026-11-15T12:00:00Z'), prox = new Date('2026-11-16T12:00:00Z');
    expect(weekSeed(seg)).toBe(weekSeed(dom));
    expect(weekSeed(prox)).toBe(weekSeed(seg) + 1);
    const a = pickFeatured(catalog, 8, weekSeed(seg)).map(p => p.id);
    const b = pickFeatured(catalog, 8, weekSeed(prox)).map(p => p.id);
    expect(a).not.toEqual(b);
  });

  it('só fronhas no catálogo: completa com elas mesmo', () => {
    const only = catalog.filter(p => p.category === 'Fronhas');
    expect(pickFeatured(only, 8, 1)).toHaveLength(8);
  });
});
