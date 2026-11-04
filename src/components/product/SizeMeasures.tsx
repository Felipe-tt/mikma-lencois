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
 * O que vem no pacote do tamanho escolhido, embaixo do seletor de tamanho:
 * a cama desenhada em escala (o mesmo fator para todos os tamanhos, então
 * trocar de Solteiro para King faz o desenho crescer de verdade), com as
 * fronhas em cima e as medidas nas bordas; ao lado, a ficha com os números.
 */
export function SizeMeasures({ line, note }: { line: PackageLine; note?: string }) {
  const sheet = line.pieces.find(p => p.kind === 'lencol');
  const pillow = line.pieces.find(p => p.kind === 'fronha');

  return (
    <div className="mt-3" data-testid="medidas">
      <div className="@container rounded-2xl border border-mist bg-warm/40 p-4">
        <div className="flex flex-col items-center gap-4 @min-[300px]:flex-row @min-[300px]:gap-4">
          <div aria-hidden="true" className="shrink-0">
            {sheet ? <BedDrawing sheet={sheet} pillow={pillow} /> : pillow ? <PillowDrawing pillow={pillow} /> : null}
          </div>
          <dl className="w-full min-w-0 flex-1 divide-y divide-mist" aria-live="polite">
            {line.pieces.map((p, i) => <Spec key={i} piece={p} />)}
          </dl>
        </div>
      </div>
      {note && <p className="mt-1.5 px-1 text-[11px] text-faint leading-snug">{note}</p>}
    </div>
  );
}

function Spec({ piece }: { piece: PackagePiece }) {
  const { dims } = piece;
  const name = piece.kind === 'lencol'
    ? '1 lençol com elástico'
    : `${piece.qty ? `${piece.qty} ` : ''}${piece.label}`;
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{name}</dt>
      <dd className="mt-0.5">
        <span className="text-[17px] font-semibold text-ink tabular-nums">{fmt(dims.l)} × {fmt(dims.c)}</span>
        <span className="text-[12px] text-mid"> cm</span>
        {piece.kind === 'lencol' && dims.a ? (
          <span className="block text-[12px] text-mid leading-snug">colchão de até <strong className="font-semibold text-ink">{fmt(dims.a)} cm</strong> de altura</span>
        ) : null}
      </dd>
    </div>
  );
}

// px por cm: o maior colchão (King, 193 × 198) cabe em ~112 × 115 px,
// o que deixa o desenho e a ficha lado a lado no celular.
const K = 0.58;
const ease = 'transition-[width,height] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none';

/** Colchão visto de cima, com o lençol, os cantos de elástico e as fronhas. */
function BedDrawing({ sheet, pillow }: { sheet: PackagePiece; pillow?: PackagePiece }) {
  const w = (sheet.dims.l ?? 0) * K;
  const h = (sheet.dims.c ?? 0) * K;
  const pillows = pillow?.qty ?? 0;
  // Fronha deitada na cabeceira: o lado de 70 cm atravessa a cama.
  const pw = Math.max(pillow?.dims.l ?? 0, pillow?.dims.c ?? 0) * K * 0.92;
  const ph = Math.min(pillow?.dims.l ?? 0, pillow?.dims.c ?? 0) * K * 0.92;

  return (
    // Espaço fixo do maior tamanho: a página não pula quando o desenho cresce.
    <div className="relative flex items-end justify-center" style={{ width: 193 * K + 42, height: 198 * K + 24 }}>
      <div className={`relative mb-[24px] mr-[42px] ${ease}`} style={{ width: w, height: h }}>
        {/* Lençol sobre o colchão: tom de tecido, mais claro no meio */}
        <div className="absolute inset-0 rounded-[9px] border-[1.5px] border-clay/55 bg-[radial-gradient(120%_90%_at_50%_40%,rgb(var(--c-paper))_55%,rgb(var(--c-warm-d)/0.7))] dark:bg-[radial-gradient(120%_90%_at_50%_40%,rgb(var(--c-warm-d))_45%,rgb(var(--c-warm)))] shadow-[0_1px_0_rgb(var(--c-clay)/0.25),0_6px_14px_-8px_rgb(0_0_0/0.25)]" />
        {/* Cantos com elástico */}
        {(['top-[3px] left-[3px] border-t border-l rounded-tl-[8px]', 'top-[3px] right-[3px] border-t border-r rounded-tr-[8px]', 'bottom-[3px] left-[3px] border-b border-l rounded-bl-[8px]', 'bottom-[3px] right-[3px] border-b border-r rounded-br-[8px]'] as const).map(c => (
          <span key={c} className={`absolute w-3 h-3 border-clay/70 border-dashed ${c}`} />
        ))}
        {/* Fronhas na cabeceira */}
        {pillows > 0 && (
          <div className="absolute inset-x-0 top-[6px] flex justify-center gap-[3px]">
            {Array.from({ length: pillows }, (_, i) => (
              <span
                key={i}
                className="relative rounded-[8px] border border-ink/15 bg-[radial-gradient(80%_70%_at_50%_45%,#fff,rgb(var(--c-warm)))] dark:bg-[radial-gradient(80%_70%_at_50%_45%,rgb(var(--c-warm-d)),rgb(var(--c-warm)))] shadow-[0_1.5px_3px_rgb(0_0_0/0.14)] transition-[width] duration-500 motion-reduce:transition-none after:absolute after:inset-[3px] after:rounded-[5px] after:border after:border-dashed after:border-ink/[0.06]"
                style={{ width: Math.min(pw, (w - 12 - (pillows - 1) * 3) / pillows), height: ph }}
              />
            ))}
          </div>
        )}
        {/* Largura, embaixo */}
        <Dimension orientation="h" label={`${fmt(sheet.dims.l)} cm`} />
        {/* Comprimento, à direita */}
        <Dimension orientation="v" label={`${fmt(sheet.dims.c)} cm`} />
      </div>
    </div>
  );
}

/** Uma fronha em destaque (fronha avulsa), com as duas medidas e a quantidade. */
function PillowDrawing({ pillow }: { pillow: PackagePiece }) {
  const long = Math.max(pillow.dims.l ?? 0, pillow.dims.c ?? 0);
  const short = Math.min(pillow.dims.l ?? 0, pillow.dims.c ?? 0);
  const w = long * 1.4;
  const h = short * 1.4;
  const many = (pillow.qty ?? 0) > 1;
  return (
    <div className="relative flex items-end justify-center" style={{ width: w + 42, height: h + 24 + (many ? 10 : 0) }}>
      <div className="relative mb-[24px] mr-[42px]" style={{ width: w, height: h }}>
        {many && <span className="absolute -top-2 left-2 right-[-6px] bottom-2 rounded-[12px] border border-ink/10 bg-white/70 dark:bg-warm/70" />}
        <span className="absolute inset-0 rounded-[12px] border border-ink/15 bg-[radial-gradient(80%_70%_at_50%_45%,#fff,rgb(var(--c-warm)))] dark:bg-[radial-gradient(80%_70%_at_50%_45%,rgb(var(--c-warm-d)),rgb(var(--c-warm)))] shadow-[0_2px_6px_rgb(0_0_0/0.12)] after:absolute after:inset-[5px] after:rounded-[8px] after:border after:border-dashed after:border-ink/[0.06]" />
        {many && <span className="absolute top-2 left-2 rounded-full bg-ink text-paper text-[11px] font-semibold px-2 py-0.5">×{pillow.qty}</span>}
        <Dimension orientation="h" label={`${fmt(long)} cm`} />
        <Dimension orientation="v" label={`${fmt(short)} cm`} />
      </div>
    </div>
  );
}

/** Cota de desenho técnico: linha com as pontas marcadas e a medida. */
function Dimension({ orientation, label }: { orientation: 'h' | 'v'; label: string }) {
  if (orientation === 'h') {
    return (
      <div className="absolute left-0 right-0 top-full mt-[7px] flex flex-col items-center">
        <span className="relative block h-px w-full bg-mid/50 before:absolute before:left-0 before:-top-[3px] before:h-[7px] before:w-px before:bg-mid/50 after:absolute after:right-0 after:-top-[3px] after:h-[7px] after:w-px after:bg-mid/50" />
        <span className="mt-1 text-[10.5px] font-medium text-mid tabular-nums whitespace-nowrap">{label}</span>
      </div>
    );
  }
  return (
    <div className="absolute top-0 bottom-0 left-full ml-[7px] flex items-center gap-1">
      <span className="relative block w-px h-full bg-mid/50 before:absolute before:top-0 before:-left-[3px] before:w-[7px] before:h-px before:bg-mid/50 after:absolute after:bottom-0 after:-left-[3px] after:w-[7px] after:h-px after:bg-mid/50" />
      <span className="text-[10.5px] font-medium text-mid tabular-nums whitespace-nowrap">{label}</span>
    </div>
  );
}
