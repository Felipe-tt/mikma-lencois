import { describe, it, expect } from 'vitest';
import { formatMeasure, normalizeMeasureText, parseMeasure } from './measures';

describe('medidas', () => {
  it('lê o formato misturado e converte metro em centímetro', () => {
    expect(parseMeasure('0,88x188x0,40 cm')).toEqual({ l: 88, c: 188, a: 40 });
    expect(normalizeMeasureText('0,88x188x0,40 cm')).toBe('88 × 188 × 40 cm');
  });
  it('sem altura', () => {
    expect(normalizeMeasureText('50x70 cm')).toBe('50 × 70 cm');
    expect(normalizeMeasureText('180×220')).toBe('180 × 220 cm');
  });
  it('decimal com vírgula', () => {
    expect(formatMeasure({ l: 88.5, c: 188, a: 30 })).toBe('88,5 × 188 × 30 cm');
  });
  it('texto que não é medida fica como veio', () => {
    expect(normalizeMeasureText('Sob consulta')).toBe('Sob consulta');
    expect(normalizeMeasureText('')).toBe('');
  });
});
