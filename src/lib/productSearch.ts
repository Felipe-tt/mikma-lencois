import { FABRIC_LABEL } from '@/lib/productOptions';
import type { Product } from '@/types';

/** Minúsculas e sem acento: "Lençóis" e "lencois" batem. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Palavras que não ajudam a achar nada ("jogo de lençol", "158 x 198 cm").
const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'e', 'o', 'a', 'os', 'as', 'x', 'cm', 'size', 'tamanho', 'tam', 'um', 'uma']);

// Como o cliente chama x como a loja chama (já sem acento e no singular).
const SYNONYMS: Record<string, string[]> = {
  travesseiro: ['fronha'],
  kingsize: ['king'],
  queensize: ['queen'],
  solteirao: ['solteiro'],
  duplo: ['casal'],
};

/** Singular simples do português: lençóis → lencol, fronhas → fronha, colchões → colchao. */
function stem(word: string): string {
  if (/^\d+$/.test(word)) return word;
  if (word.length > 4 && word.endsWith('ois')) return word.slice(0, -3) + 'ol';
  if (word.length > 4 && (word.endsWith('oes') || word.endsWith('aes'))) return word.slice(0, -3) + 'ao';
  if (word.length > 3 && word.endsWith('ns')) return word.slice(0, -2) + 'm';
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Texto → palavras comparáveis. "158x198cm" vira "158" e "198". */
function tokenize(text: string): string[] {
  return normalizeSearch(text)
    .replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1 ')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem);
}

/** Distância de edição com troca de letras vizinhas (Damerau). */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Quanto o termo bate com a palavra: 4 igual, 3 começo, 1 com erro de digitação, 0 nada. */
function matchQuality(term: string, token: string): number {
  if (term === token) return 4;
  if (/^\d+$/.test(term)) {
    // Medida: aceita 2 cm de folga ("160" acha o Queen de 158).
    return /^\d+$/.test(token) && Math.abs(Number(term) - Number(token)) <= 2 ? 3 : 0;
  }
  if (term.length >= 2 && token.startsWith(term)) return 3;
  // Palavra curta ("kng") só aceita erro se começar com a mesma letra.
  const max = term.length >= 8 ? 2 : term.length >= 4 ? 1 : term.length === 3 && token[0] === term[0] ? 1 : 0;
  if (!max) return 0;
  if (editDistance(term, token, max) <= max) return 1;
  // Palavra ainda sendo digitada com erro: compara com o começo do mesmo tamanho.
  if (token.length > term.length && editDistance(term, token.slice(0, term.length), max) <= max) return 1;
  return 0;
}

type Searchable = Pick<Product, 'name' | 'category' | 'description' | 'tags' | 'variants'>;

export interface SearchOptions<T> {
  /** Medidas em cm de cada produto (lençol e fronha), para "158x198" achar o Queen. */
  measuresOf?: (p: T) => number[];
}

interface Field { tokens: string[]; weight: number }

function fieldsOf<T extends Searchable>(p: T, opts?: SearchOptions<T>): Field[] {
  const category = normalizeSearch(p.category ?? '');
  // Jogo de cama tem lençol e fronha: "jogo de lençol" e "lençol casal"
  // também mostram o jogo (depois do lençol, que bate pelo nome).
  const contains = category.startsWith('jogo') ? 'lencol fronha' : '';
  return [
    { tokens: tokenize(p.name ?? ''), weight: 3 },
    { tokens: tokenize(`${p.category ?? ''} ${(p.variants ?? []).map(v => `${v.size} ${v.colorName ?? ''}`).join(' ')}`), weight: 2 },
    { tokens: tokenize(`${p.description ?? ''} ${(p.tags ?? []).join(' ')} ${FABRIC_LABEL} ${contains}`), weight: 1 },
    { tokens: (opts?.measuresOf?.(p) ?? []).map(String), weight: 2 },
  ];
}

function termScore(term: string, fields: Field[]): number {
  const variants = [term, ...(SYNONYMS[term] ?? [])];
  let best = 0;
  for (const f of fields) for (const tok of f.tokens) for (const v of variants) {
    const q = matchQuality(v, tok);
    if (q) best = Math.max(best, q * f.weight);
  }
  return best;
}

export interface SearchResult<T> {
  products: T[];
  /** Nada bateu com todas as palavras: são os mais parecidos. */
  approximate: boolean;
}

/**
 * Busca do catálogo. Cada palavra precisa aparecer em algum lugar do
 * produto (nome, categoria, tamanho, cor, descrição, tags, medidas), em
 * qualquer ordem, sem acento, no plural ou com um erro de digitação. O que
 * bate pelo nome vem primeiro. Sem nenhum produto com todas as palavras,
 * devolve os que batem com mais delas (approximate).
 */
export function searchCatalog<T extends Searchable>(products: T[], query: string, opts?: SearchOptions<T>): SearchResult<T> {
  const terms = tokenize(query).filter(t => !STOPWORDS.has(t));
  if (terms.length === 0) return { products, approximate: false };
  const scored = products.map((p, i) => {
    const fields = fieldsOf(p, opts);
    const scores = terms.map(t => termScore(t, fields));
    return { p, i, hits: scores.filter(Boolean).length, score: scores.reduce((a, b) => a + b, 0) };
  });
  const rank = (a: typeof scored[number], b: typeof scored[number]) => b.hits - a.hits || b.score - a.score || a.i - b.i;
  const exact = scored.filter(s => s.hits === terms.length).sort(rank);
  if (exact.length) return { products: exact.map(s => s.p), approximate: false };
  const near = scored.filter(s => s.hits > 0).sort(rank).slice(0, 12);
  return { products: near.map(s => s.p), approximate: near.length > 0 };
}

/** Só os produtos com todas as palavras, do mais parecido para o menos. */
export function searchProducts<T extends Searchable>(products: T[], query: string, opts?: SearchOptions<T>): T[] {
  const r = searchCatalog(products, query, opts);
  return r.approximate ? [] : r.products;
}
