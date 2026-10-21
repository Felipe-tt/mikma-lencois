/**
 * Nome de cor escrito à mão, sempre do mesmo jeito: "azul marinho",
 * "AZUL MARINHO" e " Azul  marinho " viram "Azul Marinho". Erros de
 * digitação ("Azul marinhoo", "Azul marino") são detectados comparando com
 * as cores que a loja já usa e com a paleta conhecida.
 */

const LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com']);

/** "  azul   MARINHO " → "Azul Marinho"; "off-white" → "Off-White"; "rosa de chá" → "Rosa de Chá". */
export function formatColorName(raw: string): string {
  const words = raw.trim().replace(/\s+/g, ' ').toLowerCase().split(' ').filter(Boolean);
  return words
    .map((w, i) => (i > 0 && LOWER_WORDS.has(w)
      ? w
      : w.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-')))
    .join(' ');
}

/** Chave para comparar: sem acento, sem maiúscula, sem pontuação e sem letra repetida ("Marinhoo" = "marinho"). */
export function colorKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/(.)\1+/g, '$1');
}

/** Distância de edição contando troca de letras vizinhas como 1 ("Brnaco" → "Branco"). */
export function editDistance(a: string, b: string): number {
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

/** Cores ordenadas da mais parecida com o que foi digitado para a menos. */
export function sortBySimilarity(typed: string, names: string[]): string[] {
  const key = colorKey(typed);
  return [...names].sort((x, y) => editDistance(key, colorKey(x)) - editDistance(key, colorKey(y)) || x.localeCompare(y, 'pt-BR'));
}

export type ColorMatch =
  | { kind: 'none' }
  /** Mesma cor escrita de outro jeito: usar `name` (forma já usada na loja). */
  | { kind: 'same'; name: string }
  /** Parece erro de digitação de `name`: perguntar. */
  | { kind: 'typo'; name: string };

/**
 * Compara o que foi digitado com nomes conhecidos (os da loja primeiro, a
 * paleta depois). Tolerância: 1 letra até 6 letras, 2 a partir de 7.
 */
export function matchColorName(typed: string, known: string[]): ColorMatch {
  const key = colorKey(typed);
  if (!key) return { kind: 'none' };
  let best: { name: string; dist: number } | null = null;
  for (const name of known) {
    const k = colorKey(name);
    if (!k) continue;
    if (k === key) return { kind: 'same', name: formatColorName(name) };
    const limit = Math.max(key.length, k.length) >= 7 ? 2 : 1;
    if (Math.abs(k.length - key.length) > limit) continue;
    const d = editDistance(key, k);
    if (d <= limit && (!best || d < best.dist)) best = { name, dist: d };
  }
  return best ? { kind: 'typo', name: formatColorName(best.name) } : { kind: 'none' };
}
