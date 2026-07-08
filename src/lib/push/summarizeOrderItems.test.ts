import { describe, it, expect } from 'vitest';
import { summarizeOrderItems } from './summarizeOrderItems';

describe('summarizeOrderItems', () => {
  it('retorna "Pedido" para lista vazia', () => {
    expect(summarizeOrderItems([])).toBe('Pedido');
  });

  it('resume um único item', () => {
    expect(summarizeOrderItems([{ productName: 'Lençol Queen Branco', quantity: 2 }]))
      .toBe('2x Lençol Queen Branco');
  });

  it('junta múltiplos itens quando cabe no limite', () => {
    const items = [
      { productName: 'Fronha Avulsa', quantity: 3 },
      { productName: 'Lençol Solteiro', quantity: 1 },
    ];
    expect(summarizeOrderItems(items, 60)).toBe('3x Fronha Avulsa + 1x Lençol Solteiro');
  });

  it('trunca e mostra "+ N itens" quando não cabe no limite', () => {
    const items = [
      { productName: 'Jogo de Lençol King Size 400 Fios', quantity: 1 },
      { productName: 'Fronha Avulsa Percal', quantity: 2 },
      { productName: 'Edredom Casal', quantity: 1 },
    ];
    const result = summarizeOrderItems(items, 40);
    expect(result).toContain('Jogo de Lençol King Size 400 Fios');
    expect(result).toMatch(/\+ 2 itens$/);
  });

  it('usa singular "item" quando resta só 1', () => {
    const items = [
      { productName: 'Jogo de Lençol King Size 400 Fios Egípcios', quantity: 1 },
      { productName: 'Fronha', quantity: 1 },
    ];
    const result = summarizeOrderItems(items, 40);
    expect(result).toMatch(/\+ 1 item$/);
  });
});
