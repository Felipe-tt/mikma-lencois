import { describe, it, expect } from 'vitest';
import { withStoreDefaults, STORE_DEFAULTS } from './store-settings';

describe('withStoreDefaults', () => {
  it('sem nada salvo usa os padrões, sem o "sem custo adicional"', () => {
    const s = withStoreDefaults(undefined);
    expect(s.storeName).toBe(STORE_DEFAULTS.storeName);
    expect(s.aboutTimeline).not.toContain('sem custo adicional');
  });

  it('corrige o texto antigo gravado no banco e mantém o resto', () => {
    const saved = JSON.stringify([
      { year: '2020', label: 'Entrega local', desc: 'Lançamos entrega em até 1h para toda Blumenau, sem custo adicional.' },
      { year: '2024', label: 'Loja online', desc: 'Texto da loja.' },
    ]);
    const s = withStoreDefaults({ aboutTimeline: saved, storeName: 'Outra' });
    const items = JSON.parse(s.aboutTimeline);
    expect(items[0].desc).toBe('Lançamos entrega em até 1h para toda Blumenau.');
    expect(items[1].desc).toBe('Texto da loja.');
    expect(s.storeName).toBe('Outra');
  });
});
