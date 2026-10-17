import { describe, expect, it } from 'vitest';
import { normalizeSearch, searchProducts } from './productSearch';

const base = { description: '', tags: [] as string[], variants: [] as never[] };
const products = [
  { ...base, name: 'Lençol Casal Percal 200 fios Branco', category: 'Lençóis' },
  { ...base, name: 'Fronha Avulsa Algodão Cinza', category: 'Fronhas', tags: ['algodão'] },
  { ...base, name: 'Edredom Queen', category: 'Edredons', variants: [{ id: 'v1', size: 'queen', color: '#000', colorName: 'Terracota', fabric: 'malha' }] as never[] },
];

describe('normalizeSearch', () => {
  it('tira acento e caixa', () => {
    expect(normalizeSearch('  Lençóis ALGODÃO ')).toBe('lencois algodao');
  });
});

describe('searchProducts', () => {
  it('sem termo devolve tudo', () => {
    expect(searchProducts(products, '   ')).toHaveLength(3);
  });
  it('ignora acento e ordem das palavras', () => {
    expect(searchProducts(products, 'branco lencol').map(p => p.name)).toEqual(['Lençol Casal Percal 200 fios Branco']);
  });
  it('acha pela categoria e pelas tags', () => {
    expect(searchProducts(products, 'lencois')).toHaveLength(1);
    expect(searchProducts(products, 'algodao')).toHaveLength(1);
  });
  it('acha pela cor e tecido da variação', () => {
    expect(searchProducts(products, 'terracota malha').map(p => p.name)).toEqual(['Edredom Queen']);
  });
  it('termo que não existe não devolve nada', () => {
    expect(searchProducts(products, 'xyzabc')).toEqual([]);
  });
});
