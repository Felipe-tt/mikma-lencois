import { formatMeasure, parseMeasure } from '@/lib/measures';

/**
 * "Esta embalagem contém": o mesmo texto do cartão que vai dentro de cada
 * pacote, montado a partir de Configurações > Produto > "Guia de medidas"
 * (settings.sizeGuideRows). Uma linha por tamanho:
 *
 *   Solteiro: 01 Lençol (88 × 188 × 40 cm) / 01 fronha (50 × 70 cm)
 *
 * O lençol é box, então a medida dele é a do colchão (largura ×
 * comprimento × altura máxima). Não existe outra tabela "da cama".
 */

export interface PackagePiece {
  /** Sem quantidade, o texto sai só "Fronha (50 × 70 cm)". */
  qty?: number;
  /** "Lençol", "fronha", "fronhas", "Capa duvet"... */
  label: string;
  /** "88 × 188 × 40 cm" */
  measure: string;
}

export interface PackageLine {
  size: string;
  pieces: PackagePiece[];
  /** "88 × 188 cm, até 40 cm de altura", só quando o lençol tem as 3 medidas. */
  mattress?: string;
}

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const isSheet = (col: string) => norm(col).startsWith('lencol');
const isPillowcase = (col: string) => norm(col).startsWith('fronha');

/** Como no cartão: solteiro (e berço) vem com 1 fronha; casal, queen e king com 2. */
export function pillowcasesFor(size: string): number {
  const s = norm(size);
  return s.includes('solteiro') || s.includes('berco') ? 1 : 2;
}

export function parseTable(columnsJson: string | undefined | null, rowsJson: string | undefined | null): { columns: string[]; rows: Record<string, string>[] } {
  let columns: string[] = [];
  let rows: Record<string, string>[] = [];
  try { columns = JSON.parse(columnsJson || '[]'); } catch { /* vazio */ }
  try { rows = JSON.parse(rowsJson || '[]'); } catch { /* vazio */ }
  return { columns: Array.isArray(columns) ? columns : [], rows: Array.isArray(rows) ? rows : [] };
}

export function packageContents(columns: string[], rows: Record<string, string>[]): PackageLine[] {
  if (!columns.length) return [];
  const [sizeCol, ...pieceCols] = columns;
  const lines: PackageLine[] = [];
  for (const row of rows) {
    const size = (row[sizeCol] ?? '').trim();
    if (!size) continue;
    const pieces: PackagePiece[] = [];
    let mattress: string | undefined;
    for (const col of pieceCols) {
      const m = parseMeasure(row[col]);
      const measure = formatMeasure(m);
      if (!measure) continue;
      if (isPillowcase(col)) {
        const qty = pillowcasesFor(size);
        pieces.push({ qty, label: qty === 1 ? 'fronha' : 'fronhas', measure });
      } else {
        pieces.push({ qty: 1, label: col.trim(), measure });
      }
      if (isSheet(col) && m.l && m.c && m.a) {
        mattress = `${formatMeasure({ l: m.l, c: m.c })}, até ${String(m.a).replace('.', ',')} cm de altura`;
      }
    }
    if (pieces.length) lines.push({ size, pieces, mattress });
  }
  return lines;
}

/** "01 Lençol (88 × 188 × 40 cm) / 01 fronha (50 × 70 cm)" */
export function packageLineText(line: PackageLine): string {
  return line.pieces.map(p => `${p.qty ? `${String(p.qty).padStart(2, '0')} ` : ''}${p.label} (${p.measure})`).join(' / ');
}

/**
 * Só as linhas que interessam a este produto: um jogo mostra os tamanhos
 * que ele tem à venda (as variações); uma fronha avulsa mostra só a linha
 * sem lençol (ex: "Par de fronhas: 02 fronhas (50 × 70 cm)"). Se o filtro
 * não achar nada (nome de tamanho diferente no painel), mostra tudo.
 */
export function linesForProduct(lines: PackageLine[], product: { category?: string; sizes: string[] }): PackageLine[] {
  const hasSheet = (l: PackageLine) => l.pieces.some(p => norm(p.label).startsWith('lencol'));
  if (norm(product.category ?? '').startsWith('fronha')) {
    const only = lines.filter(l => !hasSheet(l));
    if (only.length) return only;
    // Sem a linha "Par de fronhas" no painel: mostra só a medida da fronha
    // (a mesma de todos os jogos), sem chutar a quantidade.
    const measure = lines.flatMap(l => l.pieces).find(p => norm(p.label).startsWith('fronha'))?.measure;
    return measure ? [{ size: 'Fronha', pieces: [{ label: 'Fronha', measure }] }] : [];
  }
  const wanted = new Set(product.sizes.map(norm));
  const bySize = lines.filter(l => hasSheet(l) && wanted.has(norm(l.size)));
  return bySize.length ? bySize : lines;
}
