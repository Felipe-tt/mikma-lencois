import { describe, it, expect } from 'vitest';
import { feedDescription, feedTitle } from './feedText';

describe('título do feed do Google', () => {
  it('jogo ganha "de Cama", tecido, composição e cor, sem repetir o tamanho', () => {
    expect(feedTitle({ name: 'Jogo Queen 3 Peças', category: 'Jogos de cama', size: 'Queen', color: 'Rosa', material: 'Malha', composition: '100% Algodão' }))
      .toBe('Jogo de Cama Queen 3 Peças Malha 100% Algodão Rosa');
  });

  it('não repete o que o nome já diz', () => {
    expect(feedTitle({ name: 'Jogo de Cama Casal Padrão Malha Branco', category: 'Jogos de cama', size: 'Casal', color: 'Branco', material: 'Malha', composition: '100% Algodão' }))
      .toBe('Jogo de Cama Casal Padrão Malha Branco 100% Algodão');
  });

  it('tecido que já traz a composição não repete "Malha"', () => {
    expect(feedTitle({ name: 'Jogo de Cama King Malha Cinza', category: 'Jogos de cama', size: 'King', color: 'Cinza', material: 'Malha 100% algodão', composition: '100% Algodão' }))
      .toBe('Jogo de Cama King Malha Cinza 100% algodão');
  });

  it('fronha avulsa: sem "Único" no título', () => {
    expect(feedTitle({ name: 'Par de Fronhas', category: 'Fronhas', size: 'Único', color: 'Estampado', material: 'Malha', composition: '100% Algodão' }))
      .toBe('Par de Fronhas Malha 100% Algodão Estampado');
  });

  it('cabe no limite do Google', () => {
    expect(feedTitle({ name: 'x'.repeat(200), category: 'Lençóis' }).length).toBe(150);
  });
});

describe('descrição do feed do Google', () => {
  it('sem descrição no cadastro: monta com tecido, o que vem no pacote e a fábrica', () => {
    const d = feedDescription({ title: 'Jogo de Cama Queen 3 Peças', composition: '100% Algodão', yarnCount: '30/1', contents: '01 Lençol com elástico (158 x 198 x 30 cm) / 02 fronhas (50 x 70 cm)' });
    expect(d).toBe('Jogo de Cama Queen 3 Peças. Malha 100% Algodão, fio 30/1, macia e resistente. No pacote: 01 Lençol com elástico (158 x 198 x 30 cm) / 02 fronhas (50 x 70 cm). Direto da fábrica em Blumenau (SC), com entrega para todo o Brasil.');
  });

  it('usa a descrição do cadastro quando existe', () => {
    const d = feedDescription({ title: 'X', description: 'Lençol macio de 100% algodão.', composition: '100% Algodão' });
    expect(d.startsWith('Lençol macio de 100% algodão.')).toBe(true);
    expect(d).not.toContain('Malha 100% Algodão');
  });
});
