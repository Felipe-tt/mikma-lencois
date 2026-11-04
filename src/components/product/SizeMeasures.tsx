import type { PackageLine, PackagePiece } from '@/lib/packageContents';

const fmt = (n?: number) => (n === undefined ? '' : String(n).replace('.', ','));
const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** A linha do tamanho escolhido; com uma linha só (ex.: fronha avulsa), ela. */
export function lineForSize(lines: PackageLine[], sizeLabel: string | undefined): PackageLine | undefined {
  if (lines.length === 1) return lines[0];
  if (!sizeLabel) return undefined;
  return lines.find(l => norm(l.size) === norm(sizeLabel));
}

/**
 * O que vem no pacote do tamanho escolhido, logo abaixo do seletor de
 * tamanho: uma linha por peça, com ícone, nome e a medida em destaque. É o
 * cartão da embalagem, sem precisar abrir nada.
 */
export function SizeMeasures({ line, note }: { line: PackageLine; note?: string }) {
  return (
    <div className="mt-3" data-testid="medidas">
      <div className="rounded-2xl border border-mist bg-warm/40 divide-y divide-mist" aria-live="polite">
        {line.pieces.map((p, i) => <Row key={i} piece={p} />)}
      </div>
      {note && <p className="mt-1.5 px-1 text-[11px] text-faint leading-snug">{note}</p>}
    </div>
  );
}

function Row({ piece }: { piece: PackagePiece }) {
  const { dims } = piece;
  const name = piece.kind === 'lencol'
    ? 'Lençol com elástico'
    : `${piece.qty ? `${piece.qty} ` : ''}${piece.label.charAt(0).toUpperCase()}${piece.label.slice(1)}`;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span aria-hidden="true" className="text-clay shrink-0">
        {piece.kind === 'fronha' ? <PillowIcon /> : <SheetIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink">{name}</p>
        {piece.kind === 'lencol' && dims.a ? (
          <p className="text-[11.5px] text-faint">colchão de até {fmt(dims.a)} cm de altura</p>
        ) : null}
      </div>
      <p className="text-[14px] font-semibold text-ink tabular-nums whitespace-nowrap">
        {fmt(dims.l)} × {fmt(dims.c)} <span className="text-[12px] font-normal text-mid">cm</span>
      </p>
    </div>
  );
}

function SheetIcon() {
  // Lençol com elástico: retângulo com os cantos franzidos.
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 9c2 0 3-1 4-4M21 9c-2 0-3-1-4-4M3 15c2 0 3 1 4 4M21 15c-2 0-3 1-4 4" />
    </svg>
  );
}

function PillowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7c4-2 10-2 14 0 1.5 3.3 1.5 6.7 0 10-4 2-10 2-14 0-1.5-3.3-1.5-6.7 0-10z" />
    </svg>
  );
}
