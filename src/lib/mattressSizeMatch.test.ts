import { describe, it, expect } from 'vitest';
import { matchMattressSize, lookupAlias, parseMattressSizeSpecs } from './mattressSizeMatch';

const sizes = parseMattressSizeSpecs(null); // usa o fallback padrão (88x188, 138x188, 158x198, 193x203)

describe('matchMattressSize', () => {
  it('reconhece medida exata de Solteiro', () => {
    const r = matchMattressSize(sizes, 88, 188);
    expect(r.size).toBe('solteiro');
    expect(r.confidence).toBe('exata');
  });

  it('reconhece medida exata de Casal', () => {
    const r = matchMattressSize(sizes, 138, 188);
    expect(r.size).toBe('casal');
    expect(r.confidence).toBe('exata');
  });

  it('reconhece medida exata de Queen', () => {
    const r = matchMattressSize(sizes, 158, 198);
    expect(r.size).toBe('queen');
    expect(r.confidence).toBe('exata');
  });

  it('reconhece medida exata de King', () => {
    const r = matchMattressSize(sizes, 193, 203);
    expect(r.size).toBe('king');
    expect(r.confidence).toBe('exata');
  });

  it('tolera pequena variação de fabricante (Casal 140x190)', () => {
    const r = matchMattressSize(sizes, 140, 190);
    expect(r.size).toBe('casal');
    expect(r.confidence).toBe('exata');
  });

  it('classifica como "próxima" quando a diferença é moderada', () => {
    const r = matchMattressSize(sizes, 150, 195); // entre Casal e Queen, mais perto de Queen
    expect(r.size).toBe('queen');
    expect(r.confidence).toBe('proxima');
  });

  it('marca como ambíguo quando fica bem no meio de dois tamanhos', () => {
    const r = matchMattressSize(sizes, 148, 193); // quase no meio de Casal e Queen
    expect(r.runnerUp).toBeDefined();
    expect(r.runnerUp).not.toBe(r.size);
  });

  it('classifica como "incerta" quando a medida é muito diferente de tudo', () => {
    const r = matchMattressSize(sizes, 50, 100); // colchão de berço, fora do catálogo
    expect(r.confidence).toBe('incerta');
  });

  it('avisa sobre colchão muito alto (>35cm)', () => {
    const r = matchMattressSize(sizes, 138, 188, 40);
    expect(r.heightWarning).toBeDefined();
  });

  it('avisa sobre colchão muito fino (<12cm)', () => {
    const r = matchMattressSize(sizes, 138, 188, 8);
    expect(r.heightWarning).toBeDefined();
  });

  it('não avisa nada para altura padrão (12-35cm)', () => {
    const r = matchMattressSize(sizes, 138, 188, 25);
    expect(r.heightWarning).toBeUndefined();
  });

  it('não avisa nada quando altura não é informada', () => {
    const r = matchMattressSize(sizes, 138, 188);
    expect(r.heightWarning).toBeUndefined();
  });

  it('usa medidas customizadas vindas das configs em vez de fixas', () => {
    const custom = parseMattressSizeSpecs(JSON.stringify([
      { key: 'queen', label: 'Queen', widthCm: 160, lengthCm: 200 },
    ]));
    const r = matchMattressSize(custom, 160, 200);
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
