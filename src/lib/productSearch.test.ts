import { describe, expect, it } from 'vitest';
import { normalizeSearch, searchCatalog, searchProducts } from './productSearch';

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
    expect(searchProducts(products, 'avulsa algodao')).toHaveLength(1);
  });
  it('todo produto é malha 100% algodão, qualquer que seja o tecido salvo', () => {
    expect(searchProducts(products, 'malha')).toHaveLength(3);
    expect(searchProducts(products, 'algodao')).toHaveLength(3);
  });
  it('acha pela cor da variação', () => {
    expect(searchProducts(products, 'terracota malha').map(p => p.name)).toEqual(['Edredom Queen']);
  });
  it('termo que não existe não devolve nada', () => {
    expect(searchProducts(products, 'xyzabc')).toEqual([]);
  });
});

describe('busca tolerante', () => {
  const v = (size: string, colorName: string) => [{ id: 'v1', size, color: '#fff', colorName, fabric: 'malha' }] as never[];
  const catalog = [
    { ...base, name: 'Lençol Casal Malha Branco', category: 'Lençóis', variants: v('casal', 'Branco') },
    { ...base, name: 'Lençol Queen Malha Areia', category: 'Lençóis', variants: v('queen', 'Areia') },
    { ...base, name: 'Jogo de Cama King Malha Cinza', category: 'Jogos de cama', variants: v('king', 'Cinza') },
    { ...base, name: 'Fronha Avulsa Malha Azul', category: 'Fronhas', variants: v('unico', 'Azul') },
  ];
  const measures: Record<string, number[]> = { casal: [138, 188, 40], queen: [158, 198, 40], king: [193, 198, 40, 50, 70], unico: [50, 70] };
  const opts = { measuresOf: (p: typeof catalog[number]) => measures[(p.variants[0] as { size: string }).size] };
  const names = (q: string) => searchProducts(catalog, q, opts).map(p => p.name);

  it('aceita erro de digitação', () => {
    expect(names('lencol kng')).toEqual(['Jogo de Cama King Malha Cinza']);
    expect(names('fornha')[0]).toBe('Fronha Avulsa Malha Azul');
    expect(names('quen')).toEqual(['Lençol Queen Malha Areia']);
  });
  it('plural e singular batem', () => {
    expect(names('fronhas')[0]).toBe('Fronha Avulsa Malha Azul');
    expect(names('jogos de cama')).toEqual(['Jogo de Cama King Malha Cinza']);
  });
  it('acha pela medida, com ou sem x e cm', () => {
    expect(names('158x198')).toEqual(['Lençol Queen Malha Areia']);
    expect(names('138 x 188 cm')).toEqual(['Lençol Casal Malha Branco']);
    expect(names('160')).toEqual(['Lençol Queen Malha Areia']);
    expect(names('50x70').sort()).toEqual(['Fronha Avulsa Malha Azul', 'Jogo de Cama King Malha Cinza']);
  });
  it('travesseiro acha fronha e jogo de lençol acha o jogo', () => {
    expect(names('travesseiro')[0]).toBe('Fronha Avulsa Malha Azul');
    expect(names('jogo de lencol')).toEqual(['Jogo de Cama King Malha Cinza']);
  });
  it('o que bate pelo nome vem primeiro', () => {
    expect(names('lencol casal')[0]).toBe('Lençol Casal Malha Branco');
    expect(names('fronha')[0]).toBe('Fronha Avulsa Malha Azul');
  });
  it('sem resultado exato devolve os mais parecidos', () => {
    const r = searchCatalog(catalog, 'lencol solteiro', opts);
    expect(r.approximate).toBe(true);
    expect(r.products[0].category).toBe('Lençóis');
    expect(searchProducts(catalog, 'lencol solteiro', opts)).toEqual([]);
  });
  it('palavra sem sentido não acha nada, nem parecido', () => {
    expect(searchCatalog(catalog, 'xyzabc', opts)).toEqual({ products: [], approximate: false });
  });
});
