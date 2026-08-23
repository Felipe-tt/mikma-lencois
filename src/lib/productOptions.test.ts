import { describe, it, expect } from 'vitest';
import { suggestProductName } from './productOptions';

describe('suggestProductName', () => {
  it('Jogo de Cama: soma lençol + fronhas nas peças', () => {
    expect(suggestProductName({ category: 'Jogos de cama', size: 'queen', fronhaCount: 2 }))
      .toBe('Jogo de Cama Queen 3 Peças');
  });

  it('Jogo de Cama solteiro (1 fronha): 2 peças, não 3', () => {
    expect(suggestProductName({ category: 'Jogos de cama', size: 'solteiro', fronhaCount: 1 }))
      .toBe('Jogo de Cama Solteiro 2 Peças');
  });

  it('Jogo de Cama sem fronhaCount definido: assume 2 (padrão do form)', () => {
    expect(suggestProductName({ category: 'Jogos de cama', size: 'king' }))
      .toBe('Jogo de Cama King 3 Peças');
  });

  it('Jogo de Cama sem tamanho ainda: string vazia (variação não adicionada)', () => {
    expect(suggestProductName({ category: 'Jogos de cama', fronhaCount: 2 })).toBe('');
  });

  it('Lençóis: prefixo + tamanho', () => {
    expect(suggestProductName({ category: 'Lençóis', size: 'casal' })).toBe('Lençol Casal');
  });

  it('Fronhas: prefixo + tamanho', () => {
    expect(suggestProductName({ category: 'Fronhas', size: 'unico' })).toBe('Fronha Único');
  });

  it('Edredons e Travesseiros também têm prefixo próprio', () => {
    expect(suggestProductName({ category: 'Edredons', size: 'queen' })).toBe('Edredom Queen');
    expect(suggestProductName({ category: 'Travesseiros', size: 'unico' })).toBe('Travesseiro Único');
  });

  it('sem tamanho ainda, categoria não-jogo: só o prefixo', () => {
    expect(suggestProductName({ category: 'Lençóis' })).toBe('Lençol');
  });

  it('categoria Outros: string vazia, deixa o vendedor escrever livre', () => {
    expect(suggestProductName({ category: 'Outros', size: 'casal' })).toBe('');
  });

  it('fronhaCount zero ou negativo (dado inválido) cai no padrão 2', () => {
    expect(suggestProductName({ category: 'Jogos de cama', size: 'queen', fronhaCount: 0 }))
      .toBe('Jogo de Cama Queen 3 Peças');
  });
});
