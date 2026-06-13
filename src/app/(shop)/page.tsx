import { adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { ProductCard } from '@/components/product/ProductCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
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

            {/* Left: copy */}
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
                <Link href="/sobre" className="text-[13px] font-medium text-mid hover:text-ink transition-colors flex items-center gap-1.5 group">
                  Nossa história
                  <svg className="transition-transform duration-150 group-hover:translate-x-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>

              {/* Trust signals — inline, no box */}
              <div className="mt-10 pt-6 border-t border-mist/60 flex flex-wrap gap-x-6 gap-y-2">
                {[
                  { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, text: 'Entrega em 1h em Blumenau' },
                  { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>, text: 'Frete para todo Brasil' },
                  { icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>, text: 'PIX com confirmação imediata' },
                ].map(t => (
                  <span key={t.text} className="inline-flex items-center gap-1.5 text-[11px] text-mid font-medium">
                    <span className="text-clay shrink-0">{t.icon}</span>
                    {t.text}
                  </span>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="hidden lg:block bg-mist/50" />

            {/* Right: logo + float tags */}
            <div className="hidden lg:flex items-center justify-center relative overflow-hidden pl-16">
              {/* Watermark */}
              <p className="font-display text-[18rem] leading-none text-ink/[0.03] font-normal select-none absolute pointer-events-none tracking-[-0.04em]">M</p>

              {/* Logo */}
              <div className="relative z-10 flex flex-col items-center gap-3">
                <Image
                  src="/logo-transparent.png"
                  alt={s.storeName ?? 'Mikma Lençóis'}
                  width={192}
                  height={192}
                  className="w-48 h-48 object-contain"
                  priority
                />
                <p className="text-[9px] font-bold tracking-[0.35em] uppercase text-faint">
                  {s.storeCity?.toUpperCase() ?? 'BLUMENAU · SC'}
                </p>
              </div>

              {/* Float tags */}
              {s.heroFloatTag1Label && (
                <div className="absolute top-16 right-10 bg-paper border border-mist px-5 py-3.5 shadow-float">
                  <p className="text-[9px] text-faint uppercase tracking-[0.16em] mb-1.5">{s.heroFloatTag1Label}</p>
                  <p className="text-[15px] font-semibold text-ink leading-none">{s.heroFloatTag1Value}</p>
                </div>
              )}
              {s.heroFloatTag2Label && (
                <div className="absolute bottom-20 left-10 bg-ink px-5 py-3.5">
                  <p className="text-[9px] text-paper/40 uppercase tracking-[0.16em] mb-1.5">{s.heroFloatTag2Label}</p>
                  <p className="text-[15px] font-semibold text-paper leading-none">{s.heroFloatTag2Value}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ DIFERENCIAIS ════════════════════════════════════════════ */}
      <section className="bg-paper border-y border-mist">
        <div className="container-shop">
          <div className="grid grid-cols-1 sm:grid-cols-3">
            {[
              { n: '01', title: s.feat1Title ?? 'Entrega em 1h',  sub: s.feat1Sub ?? 'Para endereços em Blumenau via Uber Direct.' },
              { n: '02', title: s.feat2Title ?? 'Frete nacional', sub: s.feat2Sub ?? 'PAC, SEDEX e transportadoras com rastreio em tempo real.' },
              { n: '03', title: s.feat3Title ?? 'Pague com PIX',  sub: s.feat3Sub ?? 'Confirmação automática e instantânea.' },
            ].map((b, idx) => (
              <div key={b.n} className={`px-8 py-10 flex gap-5 items-start hover:bg-warm transition-colors duration-150 relative ${idx > 0 ? 'border-t sm:border-t-0 sm:border-l border-mist' : ''}`}>
                <span className="font-display text-[2.8rem] text-clay/12 leading-none font-normal shrink-0 select-none mt-0.5">
                  {b.n}
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-ink mb-2 leading-snug">{b.title}</p>
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
            <div className="flex items-center gap-5 mb-7">
              <span className="eyebrow shrink-0">Categorias</span>
              <div className="flex-1 h-px bg-mist" />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <Link
                  key={cat}
                  href={`/produtos?categoria=${encodeURIComponent(cat)}`}
                  className="chip-idle"
                >
                  {cat}
                </Link>
              ))}
              <Link href="/produtos" className="chip-idle">
                Ver todos →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ══ PRODUTOS DESTAQUE ═══════════════════════════════════════ */}
      <section className="section-md bg-paper border-t border-mist">
        <div className="container-shop">
          <SectionHeader
            eyebrow="Destaques"
            title="Escolhas da semana"
            cta={{ label: 'Ver tudo', href: '/produtos' }}
            className="mb-10 sm:mb-14"
          />

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
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-end pointer-events-none overflow-hidden pr-4 sm:pr-16">
          <p className="font-display text-[16rem] sm:text-[22rem] leading-none text-paper/[0.022] font-normal select-none tracking-[-0.05em]">
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
              <p className="mt-5 text-[14px] text-paper/45 leading-relaxed max-w-sm">
                Da nossa fábrica direto para a sua cama. Sem intermediários.
              </p>
            </div>
            <div className="shrink-0 flex flex-col sm:flex-row gap-3">
              <Link href="/produtos" className="btn-clay-lg">Comprar agora</Link>
              <Link href="/cadastro" className="btn h-14 px-8 text-[13px] font-semibold tracking-[0.06em] bg-transparent text-paper border border-paper/20 hover:bg-paper/10 hover:border-paper/30 transition-all duration-150">
                Criar conta
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
