import Image from 'next/image';
import Link from 'next/link';

export interface CategoryTile { name: string; count: number; image?: string }

// Categorias com foto de verdade (a primeira peça de cada uma). No celular
// viram uma fileira que rola de lado mostrando um pedaço do próximo cartão,
// que avisa sem texto que tem mais.
export function CategoryTiles({ categories }: { categories: CategoryTile[] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="categorias-titulo" className="bg-paper">
      <div className="container-shop pt-20 sm:pt-28">
        <div className="flex items-end justify-between gap-6 mb-8 sm:mb-10">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-clay mb-4">Para cada cama</p>
            <h2 id="categorias-titulo" className="font-display font-normal text-ink leading-[1.05] tracking-[-0.02em] text-[clamp(2rem,4vw,3.2rem)]">
              Escolha por onde começar
            </h2>
          </div>
          <Link href="/produtos" className="hidden sm:inline-flex shrink-0 items-center gap-1.5 h-10 text-[13px] font-medium text-mid hover:text-ink transition-colors">
            Ver tudo
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </Link>
        </div>
      </div>

      <ul className="container-shop flex lg:grid lg:grid-cols-4 gap-3 sm:gap-4 overflow-x-auto lg:overflow-visible snap-x snap-mandatory scroll-px-5 sm:scroll-px-8 scrollbar-none pb-2">
        {categories.slice(0, 4).map(c => (
          <li key={c.name} className="snap-start shrink-0 w-[68%] sm:w-[40%] lg:w-auto">
            <Link
              href={`/produtos?categoria=${encodeURIComponent(c.name)}`}
              className="group relative block aspect-[4/5] rounded-2xl overflow-hidden bg-warm isolate"
            >
              {c.image && (
                <Image
                  src={c.image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 22vw, (min-width: 640px) 40vw, 68vw"
                  className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
                />
              )}
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 flex items-end justify-between gap-3 text-white">
                <div className="min-w-0">
                  <p className="font-display text-[1.6rem] leading-tight">{c.name}</p>
                  <p className="text-[12px] text-white/80 mt-0.5">{c.count} {c.count === 1 ? 'peça' : 'peças'}</p>
                </div>
                <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center transition-[background-color,transform] duration-300 group-hover:bg-white group-hover:text-ink group-hover:translate-x-0.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
