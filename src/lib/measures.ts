/**
 * Medidas de peça (guia de medidas): sempre largura × comprimento × altura,
 * em centímetros. A altura é opcional (fronha não tem).
 */
export interface Measure { l?: number; c?: number; a?: number }

const num = (v: string) => Number(v.replace(',', '.'));

/**
 * Lê o texto que estava salvo ("0,88x188x0,40 cm", "180×220 cm", "50 x 70").
 * Número menor que 5 é tratado como metro e vira centímetro (0,88 → 88).
 */
export function parseMeasure(text: string | undefined | null): Measure {
  const parts = (text ?? '').match(/\d+(?:[.,]\d+)?/g)?.slice(0, 3).map(num) ?? [];
  const cm = parts.map(n => (n > 0 && n < 5 ? Math.round(n * 1000) / 10 : n));
  return { l: cm[0], c: cm[1], a: cm[2] };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ','));

/** "88 × 188 × 40 cm"; vazio se faltar largura ou comprimento. */
export function formatMeasure(m: Measure): string {
  if (!m.l || !m.c) return '';
  return `${fmt(m.l)} × ${fmt(m.c)}${m.a ? ` × ${fmt(m.a)}` : ''} cm`;
}

/** Texto do guia já no padrão; o que não parece medida fica como veio. */
export function normalizeMeasureText(text: string | undefined | null): string {
  const raw = (text ?? '').trim();
  const m = parseMeasure(raw);
  return formatMeasure(m) || raw;
}
