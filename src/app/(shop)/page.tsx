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
async function getCategories(): Promise<string[]> {
  try {
    const snap = await adminDb.collection('products').where('active','==',true).select('category').get();
    return Array.from(new Set(snap.docs.map(d => d.data().category as string).filter(Boolean))).sort();
  } catch { return []; }
}

export default async function HomePage() {
  const [products, categories, s] = await Promise.all([getFeatured(), getCategories(), getSettings()]);
  const heroLines = (s.heroTitle ?? 'Lençóis\nfeitos pra\ndurar.').split('\n');

  return (
    <>
      {/* ══ HERO ════════════════════════════════════════════════════ */}
      <section className="bg-warm overflow-hidden relative">
        <div className="container-shop">
          <div className="grid lg:grid-cols-[1fr_1px_1fr] min-h-[540px] lg:min-h-[680px]">

            {/* Left: text */}
            <div className="flex flex-col justify-center py-20 lg:py-32 lg:pr-20">
              <span className="eyebrow mb-6">
                {s.heroTag ?? 'Blumenau, SC'} — Coleção {new Date().getFullYear()}
              </span>
              <h1 className="font-display font-normal text-ink leading-[1.03] text-[clamp(3rem,7.5vw,6rem)]">
                {heroLines.map((line, i) => (
                  <span key={i}>
                    {i === 1 ? <em className="text-clay not-italic">{line}</em> : line}
                    {i < heroLines.length - 1 && <br />}
                  </span>
                ))}
              </h1>
              <p className="mt-5 text-[15px] text-mid max-w-[340px] leading-relaxed">
                {s.heroSubtitle ?? 'Qualidade direto da fábrica. Entrega em até 1h em Blumenau ou para todo o Brasil.'}
              </p>
              <div className="mt-10 flex items-center gap-5 flex-wrap">
                <Link href="/produtos" className="btn-primary-lg">Ver produtos</Link>
                <Link href="/sobre" className="text-[13px] font-medium text-mid hover:text-ink transition-colors flex items-center gap-1.5">
                  Nossa história
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>

              {/* Inline trust line */}
              <div className="mt-10 pt-6 border-t border-mist/60 flex flex-wrap gap-x-5 gap-y-1.5">
                {[
                  { icon: '⚡', text: 'Entrega em 1h em Blumenau' },
                  { icon: '📦', text: 'Frete para todo Brasil' },
                  { icon: '✓', text: 'PIX com confirmação imediata' },
                ].map(t => (
                  <span key={t.text} className="text-[11px] text-mid flex items-center gap-1.5 font-medium">
                    <span className="text-clay text-[10px]">{t.icon}</span>
                    {t.text}
                  </span>
                ))}
              </div>
            </div>

            {/* Vertical divider */}
            <div className="hidden lg:block bg-mist/50" />

            {/* Right: logo + float tags */}
            <div className="hidden lg:flex items-center justify-center relative overflow-hidden pl-16">
              {/* Watermark text */}
              <p className="font-display text-[16rem] leading-none text-ink/[0.035] font-normal select-none absolute pointer-events-none tracking-[-0.04em]">
                M
              </p>

              {/* Logo */}
              <div className="relative z-10 flex flex-col items-center">
                <Image
                  src="/logo-transparent.png"
                  alt={s.storeName ?? 'Mikma Lençóis'}
                  width={200}
                  height={200}
                  className="w-48 h-48 object-contain"
                  priority
                />
                <p className="text-[10px] font-semibold tracking-[0.32em] uppercase text-faint mt-2">
                  {s.storeCity?.toUpperCase() ?? 'BLUMENAU · SC'}
                </p>
              </div>

              {/* Float tags — bigger and cleaner */}
              {s.heroFloatTag1Label && (
                <div className="absolute top-16 right-10 bg-paper border border-mist px-5 py-3.5 shadow-float">
                  <p className="text-[9px] text-faint uppercase tracking-[0.18em] mb-1">{s.heroFloatTag1Label}</p>
                  <p className="text-[15px] font-semibold text-ink">{s.heroFloatTag1Value}</p>
                </div>
              )}
              {s.heroFloatTag2Label && (
                <div className="absolute bottom-20 left-10 bg-ink px-5 py-3.5 shadow-float">
                  <p className="text-[9px] text-paper/40 uppercase tracking-[0.18em] mb-1">{s.heroFloatTag2Label}</p>
                  <p className="text-[15px] font-semibold text-paper">{s.heroFloatTag2Value}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ DIFERENCIAIS ════════════════════════════════════════════ */}
      <section className="bg-paper border-b border-mist">
        <div className="container-shop">
          <div className="grid grid-cols-1 sm:grid-cols-3">
            {[
              { n: '01', title: s.feat1Title ?? 'Entrega em 1h',   sub: s.feat1Sub ?? 'Para endereços em Blumenau via Uber Direct.' },
              { n: '02', title: s.feat2Title ?? 'Frete nacional',   sub: s.feat2Sub ?? 'PAC, SEDEX e transportadoras com rastreio em tempo real.' },
              { n: '03', title: s.feat3Title ?? 'Pague com PIX',    sub: s.feat3Sub ?? 'Confirmação automática e instantânea.' },
            ].map((b, idx) => (
              <div key={b.n} className={`px-8 py-10 flex gap-5 items-start hover:bg-warm transition-colors duration-250 relative ${idx > 0 ? 'border-l border-mist' : ''}`}>
                <span className="font-display text-[3rem] text-clay/15 leading-none font-normal shrink-0 select-none">
                  {b.n}
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-ink mb-2">{b.title}</p>
                  <p className="text-[13px] text-mid leading-relaxed">{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CATEGORIAS ══════════════════════════════════════════════ */}
      {categories.length > 0 && (
        <section className="section-sm bg-paper">
          <div className="container-shop">
            <div className="flex items-center gap-4 mb-6">
              <span className="eyebrow">Categorias</span>
              <div className="flex-1 h-px bg-mist" />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <Link
                  key={cat}
                  href={`/produtos?categoria=${encodeURIComponent(cat)}`}
                  className="chip-idle text-[11px]"
                >
                  {cat}
                </Link>
              ))}
              <Link href="/produtos" className="chip-idle text-[11px]">
                Ver todos →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ══ PRODUTOS EM DESTAQUE ════════════════════════════════════ */}
      <section className="section-md bg-paper">
        <div className="container-shop">
          <div className="flex items-end justify-between mb-10 sm:mb-14">
            <div>
              <span className="eyebrow mb-4 block">Destaques</span>
              <h2 className="font-display font-normal text-ink text-balance text-4xl sm:text-[2.8rem] leading-tight">
                Escolhas da semana
              </h2>
            </div>
            <Link
              href="/produtos"
              className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-mid hover:text-ink transition-colors group"
            >
              Ver tudo
              <svg className="transition-transform duration-150 group-hover:translate-x-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </div>

          {products.length === 0 ? (
            <div className="py-20 text-center border border-mist">
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

      {/* ══ CTA BANNER ══════════════════════════════════════════════ */}
      <section className="bg-ink py-20 sm:py-28 relative overflow-hidden">
        {/* Watermark background */}
        <div className="absolute inset-0 flex items-center justify-end pointer-events-none overflow-hidden pr-8 sm:pr-16">
          <p className="font-display text-[18rem] sm:text-[22rem] leading-none text-paper/[0.025] font-normal select-none tracking-[-0.05em]">
            M
          </p>
        </div>

        <div className="container-shop relative z-10">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-10">
            <div className="max-w-xl">
              <span className="eyebrow text-clay mb-5 block">Qualidade real</span>
              <h2 className="font-display font-normal text-paper leading-[1.05] text-4xl sm:text-5xl lg:text-[3.5rem] text-balance">
                {s.storeSlogan ?? 'Conforto que\nvocê merece.'}
              </h2>
              <p className="mt-5 text-[14px] text-paper/50 leading-relaxed max-w-sm">
                Da nossa fábrica direto para a sua cama. Sem intermediários.
              </p>
            </div>
            <div className="shrink-0 flex flex-col sm:flex-row gap-3">
              <Link href="/produtos" className="btn-clay-lg">Comprar agora</Link>
              <Link href="/cadastro" className="btn px-8 py-[14px] text-[13px] font-semibold tracking-[0.06em] bg-transparent text-paper border border-paper/20 hover:bg-paper hover:text-ink transition-all duration-150">
                Criar conta grátis
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
