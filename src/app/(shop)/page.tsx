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

const TRUST_ITEMS = [
  { icon: '🔒', label: 'Pagamento 100% seguro' },
  { icon: '⚡', label: 'Entrega expressa' },
  { icon: '🔄', label: 'Troca garantida' },
  { icon: '📍', label: 'Feito em Blumenau, SC' },
];

export default async function HomePage() {
  const [products, s] = await Promise.all([getFeatured(), getSettings()]);
  const heroLines = (s.heroTitle ?? 'Mikma\nLençóis').split('\n');

  return (
    <>
      {/* ══ HERO ══════════════════════════════════════════════════ */}
      <section className="bg-warm overflow-hidden relative">
        {/* Subtle texture overlay */}
        <div className="absolute inset-0 opacity-[0.015] pointer-events-none"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%230F0E0C\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
            backgroundSize: '30px 30px' }} />

        <div className="container-shop">
          <div className="grid lg:grid-cols-[1fr_1px_1fr] min-h-[540px] lg:min-h-[660px] gap-0">

            {/* Left: text */}
            <div className="flex flex-col justify-center py-20 lg:py-32 lg:pr-20">
              <span className="eyebrow mb-6 animate-fade-up" style={{ animationDelay: '0ms' }}>
                {s.heroTag ?? 'Coleção'} {new Date().getFullYear()}
              </span>
              <h1
                className="font-display font-normal text-ink leading-[1.02] text-[clamp(2.8rem,7vw,5.5rem)] animate-fade-up"
                style={{ animationDelay: '80ms' }}
              >
                {heroLines.map((line, i) => (
                  <span key={i}>
                    {i === 1 ? <em className="text-clay not-italic">{line}</em> : line}
                    {i < heroLines.length - 1 && <br />}
                  </span>
                ))}
              </h1>
              <p className="mt-6 text-base text-mid max-w-sm leading-relaxed animate-fade-up" style={{ animationDelay: '160ms' }}>
                {s.heroSubtitle ?? 'Qualidade superior, conforto real. Direto da fábrica para a sua casa.'}
              </p>
              <div className="mt-10 flex items-center gap-4 flex-wrap animate-fade-up" style={{ animationDelay: '240ms' }}>
                <Link href="/produtos" className="btn-primary-lg">
                  Ver produtos
                </Link>
                <Link
                  href="/sobre"
                  className="inline-flex items-center gap-2 text-sm font-medium text-mid hover:text-ink transition-colors group"
                >
                  Nossa história
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="group-hover:translate-x-0.5 transition-transform">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </Link>
              </div>

              {/* Mini stats */}
              <div className="mt-14 flex items-center gap-8 animate-fade-up" style={{ animationDelay: '320ms' }}>
                {[
                  { num: '500+', label: 'Clientes' },
                  { num: '100%', label: 'Satisfação' },
                  { num: '1h',   label: 'Entrega local' },
                ].map(stat => (
                  <div key={stat.num}>
                    <p className="font-display text-2xl text-ink font-normal leading-none">{stat.num}</p>
                    <p className="text-2xs text-faint uppercase tracking-wider mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Vertical divider */}
            <div className="hidden lg:block bg-mist/60" />

            {/* Right: decorative editorial */}
            <div className="hidden lg:flex items-center justify-center relative overflow-hidden pl-20">
              {/* Big decorative letter */}
              <p className="font-display text-[14rem] leading-none text-ink/[0.04] font-normal select-none absolute">
                M
              </p>

              {/* Central card */}
              <div className="relative z-10 flex flex-col items-center text-center gap-6">
                <div className="w-px h-20 bg-gradient-to-b from-transparent via-mist to-mist" />
                <div className="bg-paper border border-mist px-8 py-6 shadow-card">
                  <p className="text-2xs font-semibold tracking-[0.3em] uppercase text-clay mb-1">{s.storeName ?? 'Mikma Lençóis'}</p>
                  <p className="text-xs text-faint tracking-widest">{s.storeCity?.toUpperCase() ?? 'BLUMENAU · SC'}</p>
                </div>
                <div className="w-px h-20 bg-gradient-to-b from-mist via-mist to-transparent" />
              </div>

              {/* Float tags */}
              {s.heroFloatTag1Label && (
                <div className="absolute top-20 right-12 bg-paper border border-mist px-4 py-3 shadow-float animate-fade-in" style={{ animationDelay: '400ms' }}>
                  <p className="text-2xs text-faint uppercase tracking-wider mb-0.5">{s.heroFloatTag1Label}</p>
                  <p className="text-sm font-semibold text-ink">{s.heroFloatTag1Value}</p>
                </div>
              )}
              {s.heroFloatTag2Label && (
                <div className="absolute bottom-24 left-12 bg-ink border border-ink/80 px-4 py-3 shadow-float animate-fade-in" style={{ animationDelay: '500ms' }}>
                  <p className="text-2xs text-paper/40 uppercase tracking-wider mb-0.5">{s.heroFloatTag2Label}</p>
                  <p className="text-sm font-semibold text-paper">{s.heroFloatTag2Value}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ TRUST STRIP ═══════════════════════════════════════════ */}
      <div className="border-y border-mist bg-paper overflow-hidden">
        <div className="flex items-stretch divide-x divide-mist">
          {TRUST_ITEMS.map(item => (
            <div key={item.label} className="flex-1 flex items-center justify-center gap-3 px-6 py-4 min-w-[180px]">
              <span className="text-base">{item.icon}</span>
              <p className="text-xs font-medium text-mid whitespace-nowrap hidden sm:block">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══ DIFERENCIAIS ══════════════════════════════════════════ */}
      <section className="bg-paper section-rule">
        <div className="container-shop">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-mist border border-mist">
            {[
              { n: '01', title: s.feat1Title ?? 'Qualidade Premium', sub: s.feat1Sub ?? 'Tecidos selecionados com durabilidade superior.' },
              { n: '02', title: s.feat2Title ?? 'Feito no Brasil',    sub: s.feat2Sub ?? 'Produzido em Blumenau, capital têxtil do Brasil.' },
              { n: '03', title: s.feat3Title ?? 'Entrega Segura',     sub: s.feat3Sub ?? 'Embalagem cuidadosa e rastreamento em tempo real.' },
            ].map(b => (
              <div key={b.n} className="bg-paper px-8 py-10 flex gap-5 items-start group hover:bg-warm transition-colors duration-300">
                <span className="font-display text-4xl text-clay/20 leading-none font-normal shrink-0 mt-0.5 group-hover:text-clay/40 transition-colors duration-300">
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
              className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-mid hover:text-clay transition-colors group pb-1 border-b border-transparent hover:border-clay"
            >
              Ver catálogo completo
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="group-hover:translate-x-0.5 transition-transform">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
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
        {/* Decorative lines */}
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
              <Link href="/produtos" className="btn-clay-lg">
                Comprar agora
              </Link>
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
