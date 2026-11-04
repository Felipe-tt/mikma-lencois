import { describe, expect, it } from 'vitest';
import { linesForProduct, packageContents, packageLineText, parseTable } from './packageContents';

// As medidas do cartão que vai dentro da embalagem.
const columns = ['Tamanho', 'Lençol', 'Fronha'];
const rows = [
  { Tamanho: 'Solteiro', 'Lençol': '88×188×40', Fronha: '50×70' },
  { Tamanho: 'Casal', 'Lençol': '138 x 188 x 40 cm', Fronha: '50x70cm' },
  { Tamanho: 'Queen', 'Lençol': '158×198×40', Fronha: '50×70' },
  { Tamanho: 'King', 'Lençol': '193×198×40', Fronha: '50×70' },
  { Tamanho: 'Par de fronhas', 'Lençol': '', Fronha: '50×70' },
];

describe('esta embalagem contém', () => {
  const lines = packageContents(columns, rows);

  it('monta cada linha igual ao cartão do pacote', () => {
    expect(packageLineText(lines[0])).toBe('01 Lençol (88 × 188 × 40 cm) / 01 fronha (50 × 70 cm)');
    expect(packageLineText(lines[1])).toBe('01 Lençol (138 × 188 × 40 cm) / 02 fronhas (50 × 70 cm)');
    expect(packageLineText(lines[3])).toBe('01 Lençol (193 × 198 × 40 cm) / 02 fronhas (50 × 70 cm)');
    expect(packageLineText(lines[4])).toBe('02 fronhas (50 × 70 cm)');
  });

  it('diz em qual colchão o lençol box serve', () => {
    expect(lines[0].mattress).toBe('88 × 188 cm, até 40 cm de altura');
    expect(lines[4].mattress).toBeUndefined();
  });

  it('jogo mostra só os tamanhos que ele tem; fronha avulsa só a linha das fronhas', () => {
    expect(linesForProduct(lines, { category: 'Jogos de cama', sizes: ['Casal', 'Queen'] }).map(l => l.size)).toEqual(['Jogo Box Casal', 'Jogo Box Queen']);
    expect(linesForProduct(lines, { category: 'Fronhas', sizes: ['Único'] }).map(l => l.size)).toEqual(['Par de fronhas']);
    // Sem a linha "Par de fronhas": só a medida da fronha, sem quantidade.
    const semPar = packageContents(columns, rows.slice(0, 4));
    expect(linesForProduct(semPar, { category: 'Fronhas', sizes: ['Único'] }).map(packageLineText)).toEqual(['Fronha (50 × 70 cm)']);
    // Tamanho que não está na tabela: mostra todos os jogos em vez de nada.
    expect(linesForProduct(lines, { category: 'Jogos de cama', sizes: ['Berço'] })).toHaveLength(4);
  });

  it('lençol avulso mostra só o lençol, sem as fronhas do jogo', () => {
    const [queen] = linesForProduct(lines, { category: 'Lençóis', sizes: ['Queen'] });
    expect(queen.size).toBe('Lençol Box Queen');
    expect(packageLineText(queen)).toBe('01 Lençol (158 × 198 × 40 cm)');
    expect(queen.mattress).toBe('158 × 198 cm, até 40 cm de altura');
  });

  it('tabela vazia ou JSON quebrado não mostra nada', () => {
    const t = parseTable('não é json', null);
    expect(packageContents(t.columns, t.rows)).toEqual([]);
  });
});
