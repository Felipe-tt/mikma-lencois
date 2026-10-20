import { describe, it, expect } from 'vitest';
import { plural } from './plural';

describe('plural', () => {
  it('singular só para 1', () => {
    expect(plural(1, 'unidade', 'unidades')).toBe('1 unidade');
    expect(plural(0, 'unidade', 'unidades')).toBe('0 unidades');
    expect(plural(3, 'item', 'itens')).toBe('3 itens');
    expect(plural(-1, 'peça', 'peças')).toBe('-1 peça');
  });
});
