import type { PackageLine, PackagePiece } from '@/lib/packageContents';

const fmt = (n?: number) => (n === undefined ? '' : String(n).replace('.', ','));
// "138 × 188" com espaço que não quebra: o número nunca se parte em duas linhas.
const pair = (a?: number, b?: number) => `${fmt(a)} × ${fmt(b)}`;
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
 * fronhas em cima e as cotas nas bordas; ao lado, a ficha com os números,
 * cada linha com a mesma marca da peça no desenho.
 */
export function SizeMeasures({ line, note }: { line: PackageLine; note?: string }) {
  const sheet = line.pieces.find(p => p.kind === 'lencol');
  const pillow = line.pieces.find(p => p.kind === 'fronha');

  return (
    <div className="mt-3 @container rounded-2xl border border-mist bg-warm/40" data-testid="medidas">
      <div className="flex flex-col items-center gap-4 p-4 @min-[300px]:flex-row @min-[300px]:gap-5">
        <div aria-hidden="true" className="shrink-0">
          {sheet ? <BedDrawing sheet={sheet} pillow={pillow} /> : pillow ? <PillowDrawing pillow={pillow} /> : null}
        </div>
        {/* key: ao trocar de tamanho, os números entram de novo (fade curto). */}
        <dl key={line.size} className="animate-measure-in w-full min-w-0 flex-1 divide-y divide-mist" aria-live="polite">
          {line.pieces.map((p, i) => <Spec key={i} piece={p} />)}
        </dl>
      </div>
      {note && <p className="border-t border-mist px-4 py-2.5 text-[11px] leading-snug text-faint">{note}</p>}
    </div>
  );
}

function Spec({ piece }: { piece: PackagePiece }) {
  const { dims } = piece;
  const name = piece.kind === 'lencol'
    ? '1 lençol box'
    : `${piece.qty ? `${piece.qty} ` : ''}${piece.label}`;
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <dt className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint">
        <Swatch kind={piece.kind} />
        {name}
      </dt>
      <dd className="mt-1">
        <span className="whitespace-nowrap text-[18px] font-semibold leading-none text-ink tabular-nums">{pair(dims.l, dims.c)}</span>
        <span className="text-[12px] text-mid"> cm</span>
        {piece.kind === 'lencol' && dims.a ? (
          <span className="mt-1 block text-[12px] leading-snug text-mid">
            com elástico, para colchão de até <span className="whitespace-nowrap font-semibold text-ink">{fmt(dims.a)} cm</span> de altura
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/** A mesma marca da peça no desenho, para ligar a ficha à figura. */
function Swatch({ kind }: { kind: PackagePiece['kind'] }) {
  return kind === 'fronha'
    ? <span aria-hidden="true" className="h-[8px] w-[11px] shrink-0 rounded-[3px] border border-ink/25 bg-white dark:bg-warm-d" />
    : <span aria-hidden="true" className="h-[11px] w-[11px] shrink-0 rounded-[3px] border-[1.5px] border-clay/60 bg-paper dark:bg-warm-d" />;
}

// px por cm: o maior colchão (King, 193 × 198) cabe em ~120 × 123 px, o que
// deixa o desenho e a ficha lado a lado no celular.
const K = 0.62;
// Espaço das cotas: embaixo (largura) e à direita (comprimento, em pé).
const DIM_BOTTOM = 22;
const DIM_RIGHT = 24;
const grow = 'transition-[width,height] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none';

/** Colchão visto de cima, com o lençol, os cantos de elástico e as fronhas. */
function BedDrawing({ sheet, pillow }: { sheet: PackagePiece; pillow?: PackagePiece }) {
  const w = (sheet.dims.l ?? 0) * K;
  const h = (sheet.dims.c ?? 0) * K;
  const pillows = pillow?.qty ?? 0;
  // Fronha deitada na cabeceira: o lado de 70 cm atravessa a cama.
  const pw = Math.max(pillow?.dims.l ?? 0, pillow?.dims.c ?? 0) * K * 0.9;
  const ph = Math.min(pillow?.dims.l ?? 0, pillow?.dims.c ?? 0) * K * 0.9;
  const gap = 3;
  const pillowW = Math.min(pw, (w - 12 - (pillows - 1) * gap) / Math.max(pillows, 1));

  return (
    // Espaço fixo do maior tamanho: a página não pula quando o desenho cresce.
    <div className="relative flex items-end justify-center" style={{ width: 193 * K + DIM_RIGHT, height: 198 * K + DIM_BOTTOM }}>
      <div className={`relative ${grow}`} style={{ width: w, height: h, marginBottom: DIM_BOTTOM, marginRight: DIM_RIGHT }}>
        {/* Lençol sobre o colchão: tom de tecido, mais claro no meio */}
        <div className="absolute inset-0 rounded-[9px] border-[1.5px] border-clay/55 bg-[radial-gradient(120%_90%_at_50%_40%,rgb(var(--c-paper))_55%,rgb(var(--c-warm-d)/0.7))] shadow-[0_1px_0_rgb(var(--c-clay)/0.22),0_8px_16px_-10px_rgb(0_0_0/0.3)] dark:bg-[radial-gradient(120%_90%_at_50%_40%,rgb(var(--c-warm-d))_45%,rgb(var(--c-warm)))]" />
        {/* Cantos com elástico */}
        {CORNERS.map(c => <span key={c} className={`absolute h-3 w-3 border-dashed border-clay/65 ${c}`} />)}
        {/* Fronhas na cabeceira */}
        {pillows > 0 && (
          <div className="absolute inset-x-0 top-[6px] flex justify-center" style={{ gap }}>
            {Array.from({ length: pillows }, (_, i) => (
              <span key={i} className={`${PILLOW} relative rounded-[7px] transition-[width] duration-500 motion-reduce:transition-none`} style={{ width: pillowW, height: ph }} />
            ))}
          </div>
        )}
        <Dimension orientation="h" label={`${fmt(sheet.dims.l)} cm`} />
        <Dimension orientation="v" label={`${fmt(sheet.dims.c)} cm`} />
      </div>
    </div>
  );
}

const CORNERS = [
  'left-[3px] top-[3px] rounded-tl-[7px] border-l border-t',
  'right-[3px] top-[3px] rounded-tr-[7px] border-r border-t',
  'bottom-[3px] left-[3px] rounded-bl-[7px] border-b border-l',
  'bottom-[3px] right-[3px] rounded-br-[7px] border-b border-r',
] as const;

// Fronha: tecido claro, com volume (mais claro no meio) e a costura interna.
const PILLOW = 'border border-ink/15 bg-[radial-gradient(80%_70%_at_50%_45%,#fff,rgb(var(--c-warm)))] shadow-[0_1.5px_3px_rgb(0_0_0/0.14)] after:absolute after:inset-[3px] after:rounded-[inherit] after:border after:border-dashed after:border-ink/[0.07] dark:bg-[radial-gradient(80%_70%_at_50%_45%,rgb(var(--c-warm-d)),rgb(var(--c-warm)))]';

/** Uma fronha em destaque (fronha avulsa), com as duas medidas e a quantidade. */
function PillowDrawing({ pillow }: { pillow: PackagePiece }) {
  const long = Math.max(pillow.dims.l ?? 0, pillow.dims.c ?? 0);
  const short = Math.min(pillow.dims.l ?? 0, pillow.dims.c ?? 0);
  const w = long * 1.45;
  const h = short * 1.45;
  const many = (pillow.qty ?? 0) > 1;
  return (
    <div className="relative flex items-end justify-center" style={{ width: w + DIM_RIGHT + (many ? 6 : 0), height: h + DIM_BOTTOM + (many ? 8 : 0) }}>
      <div className="relative" style={{ width: w, height: h, marginBottom: DIM_BOTTOM, marginRight: DIM_RIGHT + (many ? 6 : 0) }}>
        {/* A segunda fronha, atrás */}
        {many && <span className={`${PILLOW} absolute -right-[6px] -top-[8px] bottom-[8px] left-[6px] rounded-[11px] opacity-70`} />}
        <span className={`${PILLOW} absolute inset-0 rounded-[11px]`} />
        {many && <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-paper">×{pillow.qty}</span>}
        <Dimension orientation="h" label={`${fmt(long)} cm`} />
        <Dimension orientation="v" label={`${fmt(short)} cm`} />
      </div>
    </div>
  );
}

/** Cota de desenho técnico: linha com as pontas marcadas e a medida (a vertical, em pé). */
function Dimension({ orientation, label }: { orientation: 'h' | 'v'; label: string }) {
  const line = 'bg-mid/45 before:absolute before:bg-mid/45 after:absolute after:bg-mid/45';
  const text = 'text-[10.5px] font-medium leading-none text-mid tabular-nums whitespace-nowrap';
  if (orientation === 'h') {
    return (
      <div className="absolute inset-x-0 top-full mt-[7px] flex flex-col items-center gap-[5px]">
        <span className={`relative block h-px w-full ${line} before:-top-[3px] before:left-0 before:h-[7px] before:w-px after:-top-[3px] after:right-0 after:h-[7px] after:w-px`} />
        <span className={text}>{label}</span>
      </div>
    );
  }
  return (
    <div className="absolute inset-y-0 left-full ml-[7px] flex items-center gap-[5px]">
      <span className={`relative block h-full w-px ${line} before:-left-[3px] before:top-0 before:h-px before:w-[7px] after:-left-[3px] after:bottom-0 after:h-px after:w-[7px]`} />
      <span className={text} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{label}</span>
    </div>
  );
}
