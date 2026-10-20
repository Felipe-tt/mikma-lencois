import { FABRIC_LABEL } from '@/lib/productOptions';
import type { Product } from '@/types';

/** Minúsculas e sem acento: "Lençóis" e "lencois" batem. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Filtra produtos pela busca do header. Cada palavra digitada precisa
 * aparecer em algum lugar do produto (nome, categoria, descrição, tags,
 * tecido, cor ou tamanho), em qualquer ordem: "casal branco" acha
 * "Lençol Casal Malha Branco".
 */
export function searchProducts<T extends Pick<Product, 'name' | 'category' | 'description' | 'tags' | 'variants'>>(
  products: T[],
  query: string,
): T[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return products;
  return products.filter(p => {
    const haystack = normalizeSearch([
      p.name,
      p.category,
      p.description,
      ...(p.tags ?? []),
      // Tecido: sempre malha (o salvo em produto antigo pode ser outro).
      FABRIC_LABEL,
      ...(p.variants ?? []).flatMap(v => [v.colorName ?? '', v.size]),
    ].join(' '));
    return terms.every(t => haystack.includes(t));
  });
}
