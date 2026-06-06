import { adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';
import Image from 'next/image';
import { serialize } from '@/lib/utils/serialize';

export const dynamic = 'force-dynamic';

async function getFeatured(): Promise<Product[]> {
  try {
    const snap = await adminDb.collection('products').where('active','==',true).orderBy('createdAt','desc').limit(8).get();
    return snap.docs.map(d => serialize<Product>({ id: d.id, ...d.data() }));
  } catch { return []; }
}

export default async function HomePage() {
  const [products, s] = await Promise.all([getFeatured(), getSettings()]);
  const heroLines = (s.heroTitle ?? 'Lençóis\nfeitos pra\ndurar.').split('\n');

  return (
    <>
      {/* ══ HERO ══════════════════════════════════════════════════ */}
      <section className="bg-warm overflow-hidden relative">
        <div className="container-shop">
          <div className="grid lg:grid-cols-[1fr_1px_1fr] min-h-[540px] lg:min-h-[660px] gap-0">

            {/* Left: text */}
            <div className="flex flex-col justify-center py-20 lg:py-32 lg:pr-20">
              <span className="eyebrow mb-6">
                {s.heroTag ?? 'Blumenau, SC'} — Coleção {new Date().getFullYear()}
              </span>
              <h1 className="font-display font-normal text-ink leading-[1.02] text-[clamp(2.8rem,7vw,5.5rem)]">
                {heroLines.map((line, i) => (
                  <span key={i}>
                    {i === 1 ? <em className="text-clay not-italic">{line}</em> : line}
                    {i < heroLines.length - 1 && <br />}
                  </span>
                ))}
              </h1>
              <p className="mt-6 text-base text-mid max-w-sm leading-relaxed">
                {s.heroSubtitle ?? 'Qualidade direto da fábrica. Entrega em até 1h em Blumenau ou para todo o Brasil.'}
              </p>
              <div className="mt-10 flex items-center gap-4 flex-wrap">
                <Link href="/produtos" className="btn-primary-lg">Ver produtos</Link>
                <Link href="/sobre" className="inline-flex items-center gap-2 text-sm font-medium text-mid hover:text-ink transition-colors">
                  Nossa história
                </Link>
              </div>
            </div>

            {/* Vertical divider */}
            <div className="hidden lg:block bg-mist/60" />

            {/* Right: logo + float tags */}
            <div className="hidden lg:flex items-center justify-center relative overflow-hidden pl-20">
              {/* Big decorative M */}
              <p className="font-display text-[14rem] leading-none text-ink/[0.04] font-normal select-none absolute pointer-events-none">
                M
              </p>

              {/* Logo centralizada — tamanho real */}
              <div className="relative z-10 flex flex-col items-center gap-0">
                <Image
                  src="/logo-transparent.png"
                  alt={s.storeName ?? 'Mikma Lençóis'}
                  width={180}
                  height={180}
                  className="w-44 h-44 object-contain"
                  priority
                />
                <p className="text-2xs font-semibold tracking-[0.3em] uppercase text-faint mt-1">
                  {s.storeCity?.toUpperCase() ?? 'BLUMENAU · SC'}
                </p>
              </div>

              {/* Float tags */}
              {s.heroFloatTag1Label && (
                <div className="absolute top-20 right-12 bg-paper border border-mist px-4 py-3 shadow-float">
                  <p className="text-2xs text-faint uppercase tracking-wider mb-0.5">{s.heroFloatTag1Label}</p>
                  <p className="text-sm font-semibold text-ink">{s.heroFloatTag1Value}</p>
                </div>
              )}
              {s.heroFloatTag2Label && (
                <div className="absolute bottom-24 left-12 bg-ink border border-ink/80 px-4 py-3 shadow-float">
                  <p className="text-2xs text-paper/40 uppercase tracking-wider mb-0.5">{s.heroFloatTag2Label}</p>
                  <p className="text-sm font-semibold text-paper">{s.heroFloatTag2Value}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ DIFERENCIAIS ══════════════════════════════════════════ */}
      <section className="bg-paper">
        <div className="container-shop">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-mist border border-mist">
            {[
              { n: '01', title: s.feat1Title ?? 'Entrega em 1h',     sub: s.feat1Sub ?? 'Para endereços em Blumenau via Uber Direct.' },
              { n: '02', title: s.feat2Title ?? 'Frete nacional',     sub: s.feat2Sub ?? 'PAC, SEDEX e transportadoras com rastreio em tempo real.' },
              { n: '03', title: s.feat3Title ?? 'Pague com PIX',      sub: s.feat3Sub ?? 'Confirmação automática e instantânea.' },
            ].map(b => (
              <div key={b.n} className="bg-paper px-8 py-10 flex gap-5 items-start hover:bg-warm transition-colors duration-300">
                <span className="font-display text-4xl text-clay/20 leading-none font-normal shrink-0 mt-0.5">
                  {b.n}
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink mb-2">{b.title}</p>
                  <p className="text-sm text-mid leading-relaxed">{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRODUTOS EM DESTAQUE ═══════════════════════════════════ */}
      <section className="py-16 sm:py-24 bg-paper">
        <div className="container-shop">
          <div className="flex items-end justify-between mb-12 sm:mb-16">
            <div>
              <span className="eyebrow mb-4 block">Destaques</span>
              <h2 className="font-display font-normal text-ink text-4xl sm:text-5xl leading-tight">
                Escolhas da<br />
                <em className="not-italic text-clay">semana</em>
              </h2>
            </div>
            <Link
              href="/produtos"
              className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-mid hover:text-clay transition-colors pb-1 border-b border-transparent hover:border-clay"
            >
              Ver catálogo completo
            </Link>
          </div>

          {products.length === 0 ? (
            <div className="py-24 text-center border border-mist">
              <p className="font-display text-2xl text-faint font-normal">Nenhum produto ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-mist border border-mist">
              {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
            </div>
          )}

          <div className="mt-8 sm:hidden text-center">
            <Link href="/produtos" className="btn-outline">Ver todos os produtos</Link>
          </div>
        </div>
      </section>

      {/* ══ CTA BANNER ════════════════════════════════════════════ */}
      <section className="bg-ink py-20 sm:py-28 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-5">
          <div className="absolute top-0 left-1/4 w-px h-full bg-paper" />
          <div className="absolute top-0 right-1/4 w-px h-full bg-paper" />
        </div>
        <div className="container-shop relative z-10">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-10">
            <div className="max-w-xl">
              <span className="eyebrow text-clay mb-5 block">Qualidade real</span>
              <h2 className="font-display font-normal text-paper leading-[1.05] text-4xl sm:text-5xl lg:text-6xl text-balance">
                {s.storeSlogan ?? 'Conforto que\nvocê merece.'}
              </h2>
              <p className="mt-5 text-base text-paper/40 leading-relaxed max-w-sm">
                Da nossa fábrica direto para a sua casa. Sem intermediários.
              </p>
            </div>
            <div className="shrink-0 flex flex-col sm:flex-row gap-3">
              <Link href="/produtos" className="btn-clay-lg">Comprar agora</Link>
              <Link href="/cadastro" className="btn-outline text-paper border-paper/30 hover:bg-paper hover:text-ink px-8 py-4 text-sm font-semibold tracking-wide">
                Criar conta grátis
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
