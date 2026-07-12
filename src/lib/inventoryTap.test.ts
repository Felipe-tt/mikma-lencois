import { describe, it, expect } from 'vitest';
import { nextTapDelta, shouldConfirmRapidTap, applyTapDelta, RAPID_CONFIRM_THRESHOLD } from './inventoryTap';

describe('nextTapDelta', () => {
  it('venda soma -1 a cada toque', () => {
    expect(nextTapDelta('venda', 0)).toBe(-1);
    expect(nextTapDelta('venda', -1)).toBe(-2);
    expect(nextTapDelta('venda', -4)).toBe(-5);
  });

  it('reposição soma +1 a cada toque', () => {
    expect(nextTapDelta('reposicao', 0)).toBe(1);
    expect(nextTapDelta('reposicao', 1)).toBe(2);
  });

  it('trocar de modo no meio corrige na direção oposta (desfazer)', () => {
    // vendeu 3, trocou pro modo reposição sem querer e toca pra corrigir
    expect(nextTapDelta('reposicao', -3)).toBe(-2);
  });
});

describe('shouldConfirmRapidTap', () => {
  it('não confirma nos primeiros toques (1 a 4)', () => {
    expect(shouldConfirmRapidTap(0, 1)).toBe(false);
    expect(shouldConfirmRapidTap(1, 2)).toBe(false);
    expect(shouldConfirmRapidTap(2, 3)).toBe(false);
    expect(shouldConfirmRapidTap(3, 4)).toBe(false);
  });

  it(`confirma exatamente no ${RAPID_CONFIRM_THRESHOLD}º toque`, () => {
    expect(shouldConfirmRapidTap(4, 5)).toBe(true);
  });

  it('confirma de novo no próximo múltiplo (10, 15...)', () => {
    expect(shouldConfirmRapidTap(9, 10)).toBe(true);
    expect(shouldConfirmRapidTap(14, 15)).toBe(true);
  });

  it('não confirma nos toques entre múltiplos (6, 7, 8, 9)', () => {
    expect(shouldConfirmRapidTap(5, 6)).toBe(false);
    expect(shouldConfirmRapidTap(8, 9)).toBe(false);
  });

  it('funciona igual pro lado da reposição (positivo)', () => {
    expect(shouldConfirmRapidTap(4, 5)).toBe(true);
    expect(shouldConfirmRapidTap(3, 4)).toBe(false);
  });

  it('NÃO confirma quando o toque está corrigindo de volta (desfazendo, não errando de novo)', () => {
    // tava em 5 (já tinha confirmado), errou o modo e voltou pra 4 — não repergunta
    expect(shouldConfirmRapidTap(5, 4)).toBe(false);
    expect(shouldConfirmRapidTap(-5, -4)).toBe(false);
  });
});

describe('applyTapDelta', () => {
  it('adiciona o item ao mapa de deltas', () => {
    expect(applyTapDelta({}, 'item1', -1)).toEqual({ item1: -1 });
  });

  it('atualiza um item que já estava no mapa', () => {
    expect(applyTapDelta({ item1: -1, item2: 3 }, 'item1', -2)).toEqual({ item1: -2, item2: 3 });
  });

  it('remove o item do mapa quando o delta volta a 0', () => {
    expect(applyTapDelta({ item1: -1, item2: 3 }, 'item1', 0)).toEqual({ item2: 3 });
  });

  it('não quebra removendo um item que não estava no mapa', () => {
    expect(applyTapDelta({ item2: 3 }, 'item1', 0)).toEqual({ item2: 3 });
  });
});
