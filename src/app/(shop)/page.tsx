import { adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';
import Image from 'next/image';
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
      <section className="relative overflow-hidden bg-ink">
        <div className="container-shop">
          <div className="grid lg:grid-cols-2 min-h-[580px] lg:min-h-[720px] gap-0">

            {/* Left — copy */}
            <div className="flex flex-col justify-center py-20 lg:py-36 lg:pr-16 relative z-10">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-6 h-px bg-clay" />
                <span className="text-[10px] font-bold tracking-[0.28em] uppercase text-clay/80">
                  {s.heroTag ?? 'Blumenau, SC'} · {new Date().getFullYear()}
                </span>
              </div>

              <h1 className="font-display font-normal text-paper leading-[1.02] text-[clamp(2.8rem,7vw,5.8rem)]">
                {heroLines.map((line, i) => (
                  <span key={i} className="block">
                    {i === 1 ? <em className="text-clay not-italic">{line}</em> : line}
                  </span>
                ))}
              </h1>

              <p className="mt-6 text-[15px] text-paper/40 max-w-[320px] leading-relaxed">
                {s.heroSubtitle ?? 'Da fábrica para a sua cama. Qualidade real, sem intermediários.'}
              </p>

              <div className="mt-10 flex items-center gap-6 flex-wrap">
                <Link href="/produtos" className="btn-clay-lg">
                  Ver produtos
                </Link>
                <Link href="/sobre" className="text-[13px] font-medium text-paper/40 hover:text-paper/80 transition-colors flex items-center gap-2 group">
                  Nossa história
                  <svg className="transition-transform duration-200 group-hover:translate-x-0.5" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>

              {/* Trust — linha fina embaixo */}
              <div className="mt-12 pt-8 border-t border-paper/[0.08] flex flex-wrap gap-x-7 gap-y-2">
                {[
                  'Entrega em 1h em Blumenau',
                  'Frete para todo Brasil',
                  'PIX confirmado na hora',
                ].map(t => (
                  <span key={t} className="text-[11px] text-paper/30 font-medium flex items-center gap-2">
                    <span className="w-1 h-1 bg-clay shrink-0" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — visual com logo e float tags */}
            <div className="hidden lg:flex items-center justify-center relative">
              {/* Linha vertical divisória */}
              <div className="absolute left-0 top-20 bottom-20 w-px bg-paper/[0.07]" />

              <div className="flex flex-col items-center gap-5 relative">
                <Image
                  src="/logo-white.png"
                  alt={s.storeName ?? 'Mikma Lençóis'}
                  width={160}
                  height={80}
                  className="h-14 w-auto object-contain opacity-90"
                  priority
                />
                <p className="text-[8px] font-bold tracking-[0.4em] uppercase text-paper/20">
                  {s.storeCity?.toUpperCase() ?? 'BLUMENAU · SC'}
                </p>
              </div>

              {/* Float tags */}
              {s.heroFloatTag1Label && (
                <div className="absolute top-20 right-12 border border-paper/10 bg-paper/5 backdrop-blur-sm px-5 py-4">
                  <p className="text-[9px] text-paper/30 uppercase tracking-[0.18em] mb-1">{s.heroFloatTag1Label}</p>
                  <p className="text-[15px] font-semibold text-paper leading-none">{s.heroFloatTag1Value}</p>
                </div>
              )}
              {s.heroFloatTag2Label && (
                <div className="absolute bottom-24 right-12 border border-clay/30 bg-clay/10 px-5 py-4">
                  <p className="text-[9px] text-clay/70 uppercase tracking-[0.18em] mb-1">{s.heroFloatTag2Label}</p>
                  <p className="text-[15px] font-semibold text-paper leading-none">{s.heroFloatTag2Value}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ DIFERENCIAIS — sem números decorativos ════════════════ */}
      <section className="bg-paper border-b border-mist">
        <div className="container-shop">
          <div className="grid grid-cols-1 sm:grid-cols-3">
            {[
              {
                title: s.feat1Title ?? 'Entrega em 1h',
                sub: s.feat1Sub ?? 'Para endereços em Blumenau via Uber Direct.',
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
              },
              {
                title: s.feat2Title ?? 'Frete nacional',
                sub: s.feat2Sub ?? 'PAC, SEDEX e transportadoras com rastreio em tempo real.',
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
              },
              {
                title: s.feat3Title ?? 'Pague com PIX',
                sub: s.feat3Sub ?? 'Confirmação automática e instantânea.',
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
              },
            ].map((b, idx) => (
              <div
                key={b.title}
                className={`px-8 py-10 flex gap-5 items-start hover:bg-warm transition-colors duration-200 ${idx > 0 ? 'border-t sm:border-t-0 sm:border-l border-mist' : ''}`}
              >
                <span className="text-clay mt-0.5 shrink-0 opacity-80">{b.icon}</span>
                <div>
                  <p className="text-[14px] font-semibold text-ink mb-1.5 leading-snug">{b.title}</p>
                  <p className="text-[13px] text-mid leading-relaxed">{b.sub}</p>
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
      <section className="bg-warm border-t border-mist py-20 sm:py-28">
        <div className="container-shop">
          <FadeIn className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-12">
            <div className="max-w-lg">
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-faint mb-5">Direto da fábrica</p>
              <h2 className="font-display font-normal text-ink leading-[1.04] text-4xl sm:text-5xl lg:text-[3.2rem] text-balance">
                {s.storeSlogan ?? 'Qualidade que você sente na primeira noite.'}
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link href="/produtos" className="btn-primary-lg">Comprar agora</Link>
              <Link href="/sobre" className="btn-outline-lg">Nossa história</Link>
            </div>
          </FadeIn>

          {/* Stats row */}
          <div className="mt-16 pt-12 border-t border-mist grid grid-cols-2 sm:grid-cols-4 gap-8">
            {[
              { value: s.statOrders ?? '1.200+', label: 'Pedidos entregues' },
              { value: s.statRating ?? '4.9',    label: 'Avaliação média' },
              { value: s.statDelivery ?? '< 1h', label: 'Entrega local' },
              { value: s.statYears ?? '6 anos',  label: 'No mercado' },
            ].map(stat => (
              <div key={stat.label}>
                <p className="font-display text-3xl sm:text-4xl text-ink font-normal leading-none mb-2">{stat.value}</p>
                <p className="text-[12px] text-mid">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
