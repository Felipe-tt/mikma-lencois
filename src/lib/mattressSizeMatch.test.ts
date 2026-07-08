import { describe, it, expect } from 'vitest';
import { matchMattressSize, lookupAlias } from './mattressSizeMatch';

describe('matchMattressSize', () => {
  it('reconhece medida exata de Solteiro', () => {
    const r = matchMattressSize(88, 188);
    expect(r.size).toBe('solteiro');
    expect(r.confidence).toBe('exata');
  });

  it('reconhece medida exata de Casal', () => {
    const r = matchMattressSize(138, 188);
    expect(r.size).toBe('casal');
    expect(r.confidence).toBe('exata');
  });

  it('reconhece medida exata de Queen', () => {
    const r = matchMattressSize(158, 198);
    expect(r.size).toBe('queen');
    expect(r.confidence).toBe('exata');
  });

  it('reconhece medida exata de King', () => {
    const r = matchMattressSize(193, 203);
    expect(r.size).toBe('king');
    expect(r.confidence).toBe('exata');
  });

  it('tolera pequena variação de fabricante (Casal 140x190)', () => {
    const r = matchMattressSize(140, 190);
    expect(r.size).toBe('casal');
    expect(r.confidence).toBe('exata');
  });

  it('classifica como "próxima" quando a diferença é moderada', () => {
    const r = matchMattressSize(150, 195); // entre Casal e Queen, mais perto de Queen
    expect(r.size).toBe('queen');
    expect(r.confidence).toBe('proxima');
  });

  it('marca como ambíguo quando fica bem no meio de dois tamanhos', () => {
    const r = matchMattressSize(148, 193); // quase no meio de Casal e Queen
    expect(r.runnerUp).toBeDefined();
    expect(r.runnerUp).not.toBe(r.size);
  });

  it('classifica como "incerta" quando a medida é muito diferente de tudo', () => {
    const r = matchMattressSize(50, 100); // colchão de berço, fora do catálogo
    expect(r.confidence).toBe('incerta');
  });

  it('avisa sobre colchão muito alto (>35cm)', () => {
    const r = matchMattressSize(138, 188, 40);
    expect(r.heightWarning).toBeDefined();
  });

  it('avisa sobre colchão muito fino (<12cm)', () => {
    const r = matchMattressSize(138, 188, 8);
    expect(r.heightWarning).toBeDefined();
  });

  it('não avisa nada para altura padrão (12-35cm)', () => {
    const r = matchMattressSize(138, 188, 25);
    expect(r.heightWarning).toBeUndefined();
  });

  it('não avisa nada quando altura não é informada', () => {
    const r = matchMattressSize(138, 188);
    expect(r.heightWarning).toBeUndefined();
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
