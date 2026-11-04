import { describe, it, expect } from 'vitest';
import { matchMattressSize, lookupAlias, parseMattressWidthsFromSizeGuide } from './mattressSizeMatch';

// Fallback padrão: as medidas do cartão da embalagem.
const widths = parseMattressWidthsFromSizeGuide(null);

describe('parseMattressWidthsFromSizeGuide', () => {
  it('lê a largura do lençol na tabela de medidas usada no site', () => {
    const json = JSON.stringify([
      { Tamanho: 'Solteiro', 'Lençol': '90×188×40 cm', Fronha: '50×70 cm' },
      { Tamanho: 'Solteiro Plus', 'Lençol': '100×200×40 cm', Fronha: '50×70 cm' },
      { Tamanho: 'Casal', 'Lençol': '138×188×40 cm', Fronha: '50×70 cm' },
      { Tamanho: 'Queen', 'Lençol': '158 x 198 x 40', Fronha: '50×70 cm' },
      { Tamanho: 'King', lencol: '193×198×40', Fronha: '50×70 cm' },
    ]);
    const w = parseMattressWidthsFromSizeGuide(json);
    expect(w.solteiro.widthCm).toBe(90);
    expect(w.casal.widthCm).toBe(138);
    expect(w.queen.widthCm).toBe(158);
    expect(w.king.widthCm).toBe(193);
  });

  it('ignora linhas com nome que não é um dos 4 tamanhos vendidos (ex: Solteiro Plus)', () => {
    const w = parseMattressWidthsFromSizeGuide(JSON.stringify([{ Tamanho: 'Solteiro Plus', 'Lençol': '100×200×40' }]));
    expect(w.solteiro.widthCm).toBe(88);
  });

  it('cai no fallback quando o JSON está vazio ou ilegível', () => {
    expect(parseMattressWidthsFromSizeGuide(null).casal.widthCm).toBe(138);
    expect(parseMattressWidthsFromSizeGuide('não é json').casal.widthCm).toBe(138);
  });
});

describe('matchMattressSize', () => {
  it('reconhece medida exata de Solteiro', () => {
    const r = matchMattressSize(widths, 88);
    expect(r.size).toBe('solteiro');
    expect(r.confidence).toBe('exata');
  });

  it('reconhece medida exata de Casal', () => {
    const r = matchMattressSize(widths, 138);
    expect(r.size).toBe('casal');
    expect(r.confidence).toBe('exata');
  });

  it('reconhece medida exata de Queen', () => {
    const r = matchMattressSize(widths, 158);
    expect(r.size).toBe('queen');
    expect(r.confidence).toBe('exata');
  });

  it('reconhece medida exata de King', () => {
    const r = matchMattressSize(widths, 193);
    expect(r.size).toBe('king');
    expect(r.confidence).toBe('exata');
  });

  it('tolera pequena variação de fabricante (Casal 140cm)', () => {
    const r = matchMattressSize(widths, 140);
    expect(r.size).toBe('casal');
    expect(r.confidence).toBe('exata');
  });

  it('classifica como "próxima" quando a diferença é moderada', () => {
    const r = matchMattressSize(widths, 148); // entre Casal(138) e Queen(158), mais perto de Casal
    expect(r.size).toBe('casal');
    expect(r.confidence).toBe('proxima');
  });

  it('classifica como "incerta" quando a medida é muito diferente de tudo', () => {
    const r = matchMattressSize(widths, 50); // colchão de berço, fora do catálogo
    expect(r.confidence).toBe('incerta');
  });

  it('avisa sobre colchão mais alto que o lençol (o do cartão vai até 40 cm)', () => {
    expect(matchMattressSize(widths, 138, undefined, 40).heightWarning).toBeUndefined();
    expect(matchMattressSize(widths, 138, undefined, 42).heightWarning).toBeDefined();
  });

  it('avisa sobre colchão muito fino (<12cm)', () => {
    const r = matchMattressSize(widths, 138, undefined, 8);
    expect(r.heightWarning).toBeDefined();
  });

  it('não avisa nada para altura padrão (12-35cm)', () => {
    const r = matchMattressSize(widths, 138, undefined, 25);
    expect(r.heightWarning).toBeUndefined();
  });

  it('não avisa nada quando altura não é informada', () => {
    const r = matchMattressSize(widths, 138);
    expect(r.heightWarning).toBeUndefined();
  });

  it('usa largura customizada vinda da tabela de configs em vez de fixa', () => {
    const custom = parseMattressWidthsFromSizeGuide(JSON.stringify([
      { Tamanho: 'Queen', 'Lençol': '160×198×40 cm' },
    ]));
    const r = matchMattressSize(custom, 160);
    expect(r.size).toBe('queen');
    expect(r.confidence).toBe('exata');
  });
});

describe('altura do colchão', () => {
  it('avisa quando o colchão passa da altura do lençol daquele tamanho', () => {
    const w = parseMattressWidthsFromSizeGuide(JSON.stringify([{ Tamanho: 'Casal', 'Lençol': '138×188×40 cm' }]));
    expect(matchMattressSize(w, 138, undefined, 38).heightWarning).toBeUndefined();
    expect(matchMattressSize(w, 138, undefined, 45).heightWarning).toContain('até 40 cm');
  });
});

describe('lookupAlias', () => {
  it('reconhece "viúva" com acento', () => {
    expect(lookupAlias('viúva')?.closest).toBe('solteiro');
  });

  it('reconhece "viuva" sem acento e com espaços', () => {
    expect(lookupAlias('  Viuva  ')?.closest).toBe('solteiro');
  });

  it('reconhece "solteirão"', () => {
    expect(lookupAlias('solteirão')?.closest).toBe('casal');
  });

  it('reconhece "super king"', () => {
    expect(lookupAlias('Super King')?.closest).toBe('king');
  });

  it('retorna null para nome desconhecido', () => {
    expect(lookupAlias('colchão inflável')).toBeNull();
  });
});
