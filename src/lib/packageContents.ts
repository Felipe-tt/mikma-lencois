import { formatMeasure, parseMeasure, type Measure } from '@/lib/measures';

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
  kind: 'lencol' | 'fronha' | 'outro';
  /** Medidas separadas, em cm (largura, comprimento, altura). */
  dims: Measure;
  /** Sem quantidade, o texto sai só "Fronha (50 × 70 cm)". */
  qty?: number;
  /** "Lençol", "fronha", "fronhas", "Capa duvet"... */
  label: string;
  /** "88 × 188 × 40 cm" */
  measure: string;
}

export interface PackageLine {
  /** Nome do tamanho como no painel ("Casal"): vai no seletor. */
  size: string;
  /** Título como no cartão ("Jogo Box Casal"). */
  title: string;
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
        pieces.push({ kind: 'fronha', dims: m, qty, label: qty === 1 ? 'fronha' : 'fronhas', measure });
      } else {
        pieces.push({ kind: isSheet(col) ? 'lencol' : 'outro', dims: m, qty: 1, label: col.trim(), measure });
      }
      if (isSheet(col) && m.l && m.c && m.a) {
        mattress = `${formatMeasure({ l: m.l, c: m.c })}, até ${String(m.a).replace('.', ',')} cm de altura`;
      }
    }
    if (pieces.length) lines.push({ size, title: size, pieces, mattress });
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
  const isSheetPiece = (p: PackagePiece) => p.kind === 'lencol';
  const hasSheet = (l: PackageLine) => l.pieces.some(isSheetPiece);
  const category = norm(product.category ?? '');

  if (category.startsWith('fronha')) {
    const only = lines.filter(l => !hasSheet(l));
    if (only.length) return only;
    // Sem a linha "Par de fronhas" no painel: mostra só a medida da fronha
    // (a mesma de todos os jogos), sem chutar a quantidade.
    const piece = lines.flatMap(l => l.pieces).find(p => p.kind === 'fronha');
    return piece ? [{ size: 'Fronha', title: 'Fronha', pieces: [{ kind: 'fronha', dims: piece.dims, label: 'Fronha', measure: piece.measure }] }] : [];
  }

  const wanted = new Set(product.sizes.map(norm));
  const bySize = lines.filter(l => hasSheet(l) && wanted.has(norm(l.size)));
  const chosen = bySize.length ? bySize : lines.filter(hasSheet).length ? lines.filter(hasSheet) : lines;

  // Como no cartão: "Jogo Box Casal". Lençol avulso vem sem fronha.
  if (category.startsWith('jogo')) {
    return chosen.map(l => ({ ...l, title: norm(l.size).includes('jogo') ? l.size : `Jogo Box ${l.size}` }));
  }
  if (category.startsWith('lenc')) {
    return chosen
      .map(l => ({ ...l, title: norm(l.size).includes('lencol') ? l.size : `Lençol Box ${l.size}`, pieces: l.pieces.filter(isSheetPiece) }))
      .filter(l => l.pieces.length);
  }
  return chosen;
}
