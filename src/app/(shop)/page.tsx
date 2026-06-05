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
  const heroLines = s.heroTitle.split('\n');

  return (
    <>
      {/* ── Hero ── */}
      <section className="bg-warm overflow-hidden">
        <div className="container-shop">
          <div className="grid lg:grid-cols-2 min-h-[480px] lg:min-h-[580px]">
            <div className="flex flex-col justify-center py-16 lg:py-28 lg:pr-16">
              <span className="eyebrow mb-4 sm:mb-5">{s.heroTag} {new Date().getFullYear()}</span>
              <h1 className="font-display font-normal text-ink leading-[1.08] text-5xl sm:text-6xl lg:text-7xl xl:text-8xl">
                {heroLines.map((line, i) => (
                  <span key={i}>
                    {i === 1 ? <em className="text-clay">{line}</em> : line}
                    {i < heroLines.length - 1 && <br/>}
                  </span>
                ))}
              </h1>
              <p className="mt-5 sm:mt-7 text-sm sm:text-base text-mid max-w-xs leading-relaxed">{s.heroSubtitle}</p>
              <div className="mt-8 sm:mt-10 flex items-center gap-3 sm:gap-4 flex-wrap">
                <Link href="/produtos" className="btn-primary-lg">Ver produtos</Link>
                <Link href="/sobre" className="text-sm font-medium text-mid hover:text-clay transition-colors inline-flex items-center gap-2">
                  Nossa história
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>
            </div>

            <div className="hidden lg:flex items-center justify-center border-l border-mist relative overflow-hidden bg-warm">
              <HeroDecoration storeName={s.storeName} storeCity={s.storeCity} />
              {s.heroFloatTag1Label && (
                <div className="absolute top-16 right-12 bg-white/80 backdrop-blur-sm border border-mist px-4 py-2 shadow-sm">
                  <p className="text-xs text-mid">{s.heroFloatTag1Label}</p>
                  <p className="text-sm font-semibold text-ink">{s.heroFloatTag1Value}</p>
                </div>
              )}
              {s.heroFloatTag2Label && (
                <div className="absolute bottom-20 left-10 bg-white/80 backdrop-blur-sm border border-mist px-4 py-2 shadow-sm">
                  <p className="text-xs text-mid">{s.heroFloatTag2Label}</p>
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
              { n:'01', title: s.feat1Title, sub: s.feat1Sub },
              { n:'02', title: s.feat2Title, sub: s.feat2Sub },
              { n:'03', title: s.feat3Title, sub: s.feat3Sub },
            ].map(b => (
              <div key={b.n} className="px-6 sm:px-8 py-7 sm:py-8 flex gap-4 sm:gap-5 items-start">
                <span className="font-display text-2xl sm:text-3xl text-clay/30 leading-none font-normal shrink-0 mt-0.5">{b.n}</span>
                <div>
                  <p className="text-sm font-semibold text-ink mb-1">{b.title}</p>
                  <p className="text-sm text-mid leading-relaxed">{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Produtos ── */}
      <section className="py-14 sm:py-20">
        <div className="container-shop">
          <div className="flex items-end justify-between mb-8 sm:mb-12">
            <div>
              <span className="eyebrow mb-2 sm:mb-3 block">Destaques</span>
              <h2 className="font-display font-normal text-ink text-3xl sm:text-4xl lg:text-5xl">Produtos em destaque</h2>
            </div>
            <Link href="/produtos" className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-mid hover:text-clay transition-colors">
              Ver todos
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </div>
          {products.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-display text-2xl text-faint font-normal">Nenhum produto ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-mist">
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
          <div className="mt-8 sm:hidden text-center">
            <Link href="/produtos" className="btn-outline">Ver todos os produtos</Link>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-ink py-16 sm:py-20">
        <div className="container-shop">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 sm:gap-8">
            <div>
              <span className="eyebrow text-clay mb-3 block">Qualidade real</span>
              <h2 className="font-display font-normal text-paper leading-tight text-3xl sm:text-4xl lg:text-5xl">
                {s.storeSlogan.split(',').map((part, i, arr) => (
                  <span key={i}>{i === 0 ? part + ',' : <em className="text-clay">{part}</em>}{i < arr.length - 1 && i > 0 && <br/>}</span>
                ))}
              </h2>
            </div>
            <div className="shrink-0">
              <Link href="/produtos" className="btn-clay text-sm font-semibold px-6 sm:px-8 py-3.5 sm:py-4 tracking-wide">
                Comprar agora
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// Componente server para evitar inline styles na decoração
function HeroDecoration({ storeName, storeCity }: { storeName: string; storeCity: string }) {
  return (
    <div className="relative flex flex-col items-center gap-4 z-10">
      <Image src="/logo-white.png" alt={storeName} width={220} height={110} className="w-48 h-auto object-contain" />
      <div className="text-center">
        <div className="w-8 h-px bg-clay mx-auto"/>
        <p className="mt-2 text-xs text-mid/60 tracking-wider">{storeCity.toUpperCase()}</p>
      </div>
    </div>
  );
}
