import { adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';
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
  const heroLines = (s.heroTitle ?? 'Mikma\nLençóis').split('\n');

  return (
    <>
      {/* ── Hero ── */}
      <section className="bg-warm overflow-hidden">
        <div className="container-shop">
          <div className="grid lg:grid-cols-2 min-h-[500px] lg:min-h-[620px]">

            {/* Left: text */}
            <div className="flex flex-col justify-center py-16 lg:py-32 lg:pr-20">
              <span className="eyebrow mb-5">{s.heroTag} {new Date().getFullYear()}</span>
              <h1 className="font-display font-normal text-ink leading-[1.05] text-[clamp(3rem,8vw,6rem)]">
                {heroLines.map((line, i) => (
                  <span key={i}>
                    {i === 1 ? <em className="text-clay not-italic">{line}</em> : line}
                    {i < heroLines.length - 1 && <br />}
                  </span>
                ))}
              </h1>
              <p className="mt-6 text-base text-mid max-w-sm leading-relaxed">{s.heroSubtitle}</p>
              <div className="mt-10 flex items-center gap-4 flex-wrap">
                <Link href="/produtos" className="btn-primary-lg">Ver produtos</Link>
                <Link
                  href="/sobre"
                  className="text-sm font-medium text-mid hover:text-ink transition-colors inline-flex items-center gap-2 group"
                >
                  Nossa história
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="group-hover:translate-x-0.5 transition-transform">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </Link>
              </div>
            </div>

            {/* Right: decorative */}
            <div className="hidden lg:flex items-center justify-center border-l border-mist/60 relative">
              <div className="flex flex-col items-center gap-6 text-center">
                <div className="w-px h-24 bg-gradient-to-b from-transparent to-mist" />
                <p className="font-display text-[clamp(4rem,10vw,8rem)] leading-none text-ink/5 font-normal select-none">
                  M
                </p>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-2xs tracking-[0.3em] uppercase text-clay font-semibold">{s.storeName}</p>
                  <p className="text-xs text-faint tracking-widest">{s.storeCity?.toUpperCase()}</p>
                </div>
                <div className="w-px h-24 bg-gradient-to-b from-mist to-transparent" />
              </div>

              {s.heroFloatTag1Label && (
                <div className="absolute top-16 right-10 bg-paper border border-mist px-4 py-3 shadow-sm">
                  <p className="text-2xs text-faint uppercase tracking-wider mb-0.5">{s.heroFloatTag1Label}</p>
                  <p className="text-sm font-semibold text-ink">{s.heroFloatTag1Value}</p>
                </div>
              )}
              {s.heroFloatTag2Label && (
                <div className="absolute bottom-20 left-10 bg-paper border border-mist px-4 py-3 shadow-sm">
                  <p className="text-2xs text-faint uppercase tracking-wider mb-0.5">{s.heroFloatTag2Label}</p>
                  <p className="text-sm font-semibold text-ink">{s.heroFloatTag2Value}</p>
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      {/* ── Diferenciais ── */}
      <section className="border-y border-mist bg-paper">
        <div className="container-shop">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-mist">
            {[
              { n: '01', title: s.feat1Title, sub: s.feat1Sub },
              { n: '02', title: s.feat2Title, sub: s.feat2Sub },
              { n: '03', title: s.feat3Title, sub: s.feat3Sub },
            ].map(b => (
              <div key={b.n} className="px-7 py-8 flex gap-5 items-start">
                <span className="font-display text-3xl text-clay/25 leading-none font-normal shrink-0 mt-0.5">{b.n}</span>
                <div>
                  <p className="text-sm font-semibold text-ink mb-1">{b.title}</p>
                  <p className="text-sm text-mid leading-relaxed">{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Produtos em destaque ── */}
      <section className="py-16 sm:py-24">
        <div className="container-shop">
          <div className="flex items-end justify-between mb-10 sm:mb-14">
            <div>
              <span className="eyebrow mb-3 block">Destaques</span>
              <h2 className="font-display font-normal text-ink text-3xl sm:text-4xl lg:text-5xl">
                Produtos em destaque
              </h2>
            </div>
            <Link
              href="/produtos"
              className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-mid hover:text-clay transition-colors group"
            >
              Ver todos
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="group-hover:translate-x-0.5 transition-transform">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>

          {products.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-display text-2xl text-faint font-normal">Nenhum produto ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-mist border border-mist">
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}

          <div className="mt-8 sm:hidden text-center">
            <Link href="/produtos" className="btn-outline">Ver todos os produtos</Link>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-ink py-16 sm:py-24">
        <div className="container-shop">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
            <div>
              <span className="eyebrow text-clay mb-4 block">Qualidade real</span>
              <h2 className="font-display font-normal text-paper leading-tight text-3xl sm:text-4xl lg:text-5xl max-w-lg">
                {s.storeSlogan ?? 'Qualidade, conforto e entrega rápida.'}
              </h2>
            </div>
            <div className="shrink-0">
              <Link href="/produtos" className="btn-clay px-8 py-4 text-sm font-semibold tracking-wide">
                Comprar agora
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
