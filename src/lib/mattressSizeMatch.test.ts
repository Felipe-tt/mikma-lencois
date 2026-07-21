import { describe, it, expect } from 'vitest';
import { matchMattressSize, lookupAlias, parseMattressWidthsFromBedSizeTable } from './mattressSizeMatch';

// Fallback padrão (mesmos valores default de settings.bedSizeRows: coluna "Cama")
const widths = parseMattressWidthsFromBedSizeTable(null);

describe('parseMattressWidthsFromBedSizeTable', () => {
  it('lê a largura a partir da coluna "Cama" da tabela real usada no site', () => {
    const json = JSON.stringify([
      { Tamanho: 'Solteiro', Cama: '0,88m', Comprimento: '2,20m', Largura: '1,40m' },
      { Tamanho: 'Solteiro Plus', Cama: '1,00m', Comprimento: '2,20m', Largura: '1,50m' },
      { Tamanho: 'Casal', Cama: '1,38m', Comprimento: '2,28m', Largura: '1,80m' },
      { Tamanho: 'Queen', Cama: '1,58m', Comprimento: '2,28m', Largura: '2,10m' },
      { Tamanho: 'King', Cama: '1,93m', Comprimento: '2,28m', Largura: '2,40m' },
    ]);
    const w = parseMattressWidthsFromBedSizeTable(json);
    expect(w.solteiro.widthCm).toBe(88);
    expect(w.casal.widthCm).toBe(138);
    expect(w.queen.widthCm).toBe(158);
    expect(w.king.widthCm).toBe(193);
  });

  it('ignora linhas com nome que não é um dos 4 tamanhos vendidos (ex: Solteiro Plus)', () => {
    const json = JSON.stringify([{ Tamanho: 'Solteiro Plus', Cama: '1,00m' }]);
    const w = parseMattressWidthsFromBedSizeTable(json);
    // não deve ter sobrescrito "solteiro" com o valor de "Solteiro Plus"
    expect(w.solteiro.widthCm).toBe(88);
  });

  it('cai no fallback quando o JSON está vazio ou ilegível', () => {
    expect(parseMattressWidthsFromBedSizeTable(null).casal.widthCm).toBe(138);
    expect(parseMattressWidthsFromBedSizeTable('não é json').casal.widthCm).toBe(138);
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

  it('avisa sobre colchão muito alto (>35cm)', () => {
    const r = matchMattressSize(widths, 138, undefined, 40);
    expect(r.heightWarning).toBeDefined();
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
    const custom = parseMattressWidthsFromBedSizeTable(JSON.stringify([
      { Tamanho: 'Queen', Cama: '1,60m' },
    ]));
    const r = matchMattressSize(custom, 160);
    expect(r.size).toBe('queen');
    expect(r.confidence).toBe('exata');
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
