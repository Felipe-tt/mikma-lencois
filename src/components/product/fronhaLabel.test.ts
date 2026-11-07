import { describe, it, expect, vi } from 'vitest';
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('./BuyBox', () => ({ BuyBox: () => null }));
const { fronhaLabel } = await import('./JogoDeCamaBuyBox');
const f = (name: string, colorName?: string) => ({ name, variants: [{ id: 'v1', size: 'unico', fabric: 'Malha', color: '#fff', colorName }] }) as never;

describe('fronhaLabel', () => {
  it('"Par de Fronhas" mostra a cor; no solteiro fica no singular', () => {
    expect(fronhaLabel(f('Par de Fronhas', 'Azul'), 1)).toBe('Fronha Azul');
    expect(fronhaLabel(f('Par de Fronhas', 'Azul'), 2)).toBe('Fronhas Azul');
  });
  it('nome com estampa usa o nome, sem repetir "fronha"', () => {
    expect(fronhaLabel(f('Fronha Avulsa Malha Azul', 'Azul'), 1)).toBe('Fronha Avulsa Malha Azul');
    expect(fronhaLabel(f('Par de Fronhas Floral', 'Rosa'), 1)).toBe('Fronha Floral');
  });
});
