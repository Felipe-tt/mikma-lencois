import { adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';
import { serialize } from '@/lib/utils/serialize';
import { FadeIn } from '@/components/ui/FadeIn';

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
      {/* ══ HERO ═══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-paper border-b border-mist">
        {/* Grade de fundo — textura de tecido abstrata */}
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden opacity-[0.028]" aria-hidden>
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="absolute top-0 bottom-0 w-px bg-ink" style={{ left: `${(i + 1) * 5.55}%` }} />
          ))}
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="absolute left-0 right-0 h-px bg-ink" style={{ top: `${(i + 1) * 8.33}%` }} />
          ))}
        </div>

        <div className="container-shop">
          {/* Headline — rompe a grade, vai de borda a borda */}
          <div className="pt-14 sm:pt-20 pb-0">
            <h1
              className="font-display font-normal text-ink leading-[0.92] tracking-[-0.03em] select-none"
              style={{ fontSize: 'clamp(4.5rem, 15vw, 13rem)' }}
            >
              {(s.heroTitle ?? 'Lençóis\nfeitos pra\ndurar.').split('\n').map((line, i) => (
                <span key={i} className={`block ${i === 1 ? 'italic text-clay' : ''}`}>
                  {line}
                </span>
              ))}
            </h1>
          </div>

          {/* Linha divisória com dados técnicos — ficha de fábrica */}
          <div className="mt-10 pt-5 border-t border-mist flex flex-wrap items-start justify-between gap-6">
            {/* Copy + CTA */}
            <div className="flex flex-col gap-6 max-w-xs">
              <p className="text-[14px] text-mid leading-relaxed font-light">
                {s.heroSubtitle ?? 'Da nossa fábrica em Blumenau direto para a sua cama.'}
              </p>
              <div className="flex items-center gap-5">
                <Link href="/produtos" className="btn-primary-lg">
                  Ver produtos
                </Link>
                <Link href="/sobre" className="text-[12px] font-medium text-faint hover:text-ink transition-colors tracking-wide">
                  Sobre nós →
                </Link>
              </div>
            </div>

            {/* Ficha técnica — dados reais como elemento visual */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-mist border border-mist">
              {[
                { value: s.heroFloatTag1Value ?? '400', unit: 'fios', label: s.heroFloatTag1Label ?? 'Thread count' },
                { value: '100%', unit: '', label: 'Algodão' },
                { value: '< 1h', unit: '', label: 'Entrega local' },
                { value: 'PIX', unit: '', label: 'Pagamento' },
              ].map(item => (
                <div key={item.label} className="bg-paper px-5 py-4 flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-faint">{item.label}</span>
                  <span className="font-display text-[1.6rem] text-ink leading-none">
                    {item.value}<span className="text-[0.9rem] text-mid ml-0.5">{item.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Barra de acento inferior */}
        <div className="mt-10 h-1 bg-clay w-full" />
      </section>

      {/* ══ DIFERENCIAIS ════════════════════════════════════════════ */}
      <section className="bg-paper">
        <div className="container-shop">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-mist">
            {[
              {
                title: s.feat1Title ?? 'Entrega em 1h',
                sub: s.feat1Sub ?? 'Para endereços em Blumenau via Uber Direct.',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
              },
              {
                title: s.feat2Title ?? 'Frete nacional',
                sub: s.feat2Sub ?? 'PAC, SEDEX e transportadoras com rastreio.',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
              },
              {
                title: s.feat3Title ?? 'Pague com PIX',
                sub: s.feat3Sub ?? 'Confirmação automática e instantânea.',
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
              },
            ].map((b, idx) => (
              <div key={b.title} className="px-8 py-10 flex flex-col gap-4">
                <span className="text-clay">{b.icon}</span>
                <div>
                  <p className="font-display text-xl text-ink mb-1.5">{b.title}</p>
                  <p className="text-[13px] text-mid leading-relaxed font-light">{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CATEGORIAS ══════════════════════════════════════════════ */}
      {categories.length > 0 && (
        <section className="py-10 sm:py-14 bg-paper">
          <div className="container-shop">
            <div className="flex items-center gap-6 mb-6">
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-faint shrink-0">Categorias</p>
              <div className="flex-1 h-px bg-mist" />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <Link key={cat} href={`/produtos?categoria=${encodeURIComponent(cat)}`} className="chip-idle">
                  {cat}
                </Link>
              ))}
              <Link href="/produtos" className="chip-idle">Todos →</Link>
            </div>
          </div>
        </section>
      )}

      {/* ══ PRODUTOS DESTAQUE ═══════════════════════════════════════ */}
      <section className="section-md bg-paper border-t border-mist">
        <div className="container-shop">
          <FadeIn className="flex items-end justify-between mb-10 sm:mb-14">
            <div>
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-faint mb-4">Destaques</p>
              <h2 className="font-display font-normal text-ink text-balance text-4xl sm:text-[2.8rem] leading-tight">
                {s.featuredTitle ?? 'Escolhas da semana'}
              </h2>
            </div>
            <Link
              href="/produtos"
              className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-mid hover:text-ink transition-colors group pb-0.5 border-b border-transparent hover:border-ink/20"
            >
              Ver tudo
              <svg className="transition-transform duration-150 group-hover:translate-x-0.5" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </FadeIn>

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
      <section className="bg-ink py-20 sm:py-28">
        <div className="container-shop">
          <FadeIn className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-12">
            <div className="max-w-xl">
              <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-paper/25 mb-5">
                {s.storeCity ?? 'Blumenau, SC'} · Est. {s.foundedYear ?? '2018'}
              </p>
              <h2 className="font-display text-paper font-normal leading-[1.04] text-4xl sm:text-5xl lg:text-[3.4rem] text-balance">
                {s.storeSlogan ?? 'Qualidade que você sente na primeira noite.'}
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link href="/produtos" className="btn-clay-lg">Comprar agora</Link>
              <Link href="/sobre" className="btn h-14 px-8 text-[13px] font-semibold tracking-[0.06em] border border-paper/15 text-paper/60 hover:text-paper hover:border-paper/30 transition-all duration-150">Nossa história</Link>
            </div>
          </FadeIn>

          {/* Stats */}
          <div className="mt-16 pt-10 border-t border-paper/[0.07] grid grid-cols-2 sm:grid-cols-4 gap-8">
            {[
              { value: s.statOrders ?? '1.200+', label: 'Pedidos entregues' },
              { value: s.statRating ?? '4.9★',   label: 'Avaliação média' },
              { value: s.statDelivery ?? '< 1h',  label: 'Entrega local' },
              { value: s.statYears ?? '6 anos',   label: 'No mercado' },
            ].map(stat => (
              <div key={stat.label}>
                <p className="font-display text-3xl sm:text-[2.6rem] text-paper font-normal leading-none tracking-[-0.02em] mb-2">{stat.value}</p>
                <p className="text-[11px] text-paper/30 font-mono tracking-[0.12em] uppercase">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
