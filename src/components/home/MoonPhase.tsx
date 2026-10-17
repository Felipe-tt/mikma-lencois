// Fase da lua desenhada em SVG (0 = nova, 0.5 = cheia, 1 = nova de novo).
// É o motivo da marca, a lua do logo, usado como "ícone" de cada tecido no
// guia da home: cada cartão mostra uma fase, do mais fresco ao mais quente.
export function MoonPhase({ phase, size = 44, className = '' }: { phase: number; size?: number; className?: string }) {
  const r = 20;
  const p = ((phase % 1) + 1) % 1;
  // Largura do terminador (elipse) que separa a parte iluminada da sombra.
  const k = Math.cos(p * 2 * Math.PI);
  const rx = Math.abs(k) * r;
  const waxing = p < 0.5;
  // Metade iluminada + elipse do terminador: crescente quando k > 0.
  const litHalf = waxing
    ? `M24 4 A${r} ${r} 0 0 1 24 44`
    : `M24 4 A${r} ${r} 0 0 0 24 44`;
  const sweep = (waxing ? k > 0 : k < 0) ? 0 : 1;
  const d = `${litHalf} A${rx} ${r} 0 0 ${sweep} 24 4 Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <circle cx="24" cy="24" r={r} className="fill-current opacity-[0.14]" />
      <path d={d} className="fill-current" />
      <circle cx="24" cy="24" r={r} fill="none" className="stroke-current opacity-30" strokeWidth="1" />
    </svg>
  );
}
