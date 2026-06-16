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
      <section className="relative overflow-hidden bg-warm">
        <div className="container-shop">
          <div className="grid lg:grid-cols-[1fr_2px_1fr] min-h-[600px] lg:min-h-[700px]">

            {/* Esquerda — copy editorial */}
            <div className="flex flex-col justify-between py-16 lg:py-24 lg:pr-16">
              <div>
                <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-clay/70 mb-10">
                  {s.heroTag ?? 'Blumenau, SC'} — {new Date().getFullYear()}
                </p>
                <h1 className="font-display font-normal text-ink leading-[1.0] tracking-[-0.02em]"
                    style={{ fontSize: 'clamp(3rem, 6vw, 5rem)' }}>
                  {heroLines.map((line, i) => (
                    <span key={i} className={`block ${i === 1 ? 'italic text-clay' : ''}`}>{line}</span>
                  ))}
                </h1>
                <p className="mt-7 text-[14px] text-mid leading-relaxed max-w-[300px]">
                  {s.heroSubtitle ?? 'Da nossa fábrica direto para a sua cama — sem intermediários.'}
                </p>
              </div>

              <div className="flex flex-col gap-5 mt-10">
                <div className="flex items-center gap-5 flex-wrap">
                  <Link href="/produtos" className="btn-primary-lg">Ver produtos</Link>
                  <Link href="/sobre" className="text-[13px] text-mid hover:text-ink transition-colors border-b border-mist hover:border-ink/30 pb-0.5">
                    Nossa história
                  </Link>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
                  {['Entrega 1h · Blumenau', 'Frete nacional', 'PIX imediato'].map(t => (
                    <span key={t} className="text-[11px] text-faint font-mono tracking-[0.08em]">{t}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Divisória vertical */}
            <div className="hidden lg:block bg-mist self-stretch my-16" />

            {/* Direita — logo em destaque + dados */}
            <div className="hidden lg:flex flex-col justify-between py-16 lg:py-24 lg:pl-16">
              {/* Logo grande — protagonista */}
              <div className="flex-1 flex items-center justify-center">
                <div className="relative w-full max-w-[340px]">
                  <Image
                    src="/logo-dark.png"
                    alt={s.storeName ?? 'Mikma Lençóis'}
                    width={800}
                    height={242}
                    className="w-full h-auto object-contain"
                    priority
                  />
                </div>
              </div>

              {/* Float tags como ficha de produto */}
              <div className="grid grid-cols-2 gap-px bg-mist border border-mist mt-8">
                {[
                  { label: s.heroFloatTag1Label ?? 'Thread count', value: s.heroFloatTag1Value ?? '400 fios' },
                  { label: s.heroFloatTag2Label ?? 'Entrega local', value: s.heroFloatTag2Value ?? 'Em 1h' },
                  { label: 'Composição', value: '100% Algodão' },
                  { label: 'Pagamento', value: 'PIX' },
                ].map(item => (
                  <div key={item.label} className="bg-warm px-4 py-3">
                    <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-faint mb-1">{item.label}</p>
                    <p className="font-display text-[1.1rem] text-ink leading-tight">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Linha de acento */}
        <div className="h-px bg-mist" />
      </section>

      {/* ══ DIFERENCIAIS ════════════════════════════════════════════ */}
      <section className="bg-paper">
        <div className="container-shop">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-mist">
            {[
              { title: s.feat1Title ?? 'Entrega em 1h',  sub: s.feat1Sub ?? 'Para Blumenau via Uber Direct.', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
              { title: s.feat2Title ?? 'Frete nacional', sub: s.feat2Sub ?? 'PAC e SEDEX com rastreio.', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
              { title: s.feat3Title ?? 'Pague com PIX',  sub: s.feat3Sub ?? 'Confirmação instantânea.', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> },
            ].map(b => (
              <div key={b.title} className="px-8 py-10 flex flex-col gap-4">
                <span className="text-clay opacity-80">{b.icon}</span>
                <div>
                  <p className="font-display text-xl text-ink mb-1.5">{b.title}</p>
                  <p className="text-[13px] text-mid leading-relaxed">{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CATEGORIAS ══════════════════════════════════════════════ */}
      {categories.length > 0 && (
        <section className="py-10 sm:py-14 bg-paper border-t border-mist">
          <div className="container-shop">
            <div className="flex items-center gap-6 mb-6">
              <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-faint shrink-0">Categorias</p>
              <div className="flex-1 h-px bg-mist" />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <Link key={cat} href={`/produtos?categoria=${encodeURIComponent(cat)}`} className="chip-idle">{cat}</Link>
              ))}
              <Link href="/produtos" className="chip-idle">Todos →</Link>
            </div>
          </div>
        </section>
      )}

      {/* ══ PRODUTOS ════════════════════════════════════════════════ */}
      <section className="section-md bg-paper border-t border-mist">
        <div className="container-shop">
          <FadeIn className="flex items-end justify-between mb-10 sm:mb-14">
            <div>
              <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-faint mb-4">Destaques</p>
              <h2 className="font-display font-normal text-ink text-balance text-4xl sm:text-[2.8rem] leading-tight">
                {s.featuredTitle ?? 'Escolhas da semana'}
              </h2>
            </div>
            <Link href="/produtos" className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-mid hover:text-ink transition-colors group pb-0.5 border-b border-transparent hover:border-ink/20">
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

      {/* ══ CTA — logo + copy editorial ═════════════════════════════ */}
      <section className="bg-ink py-20 sm:py-28 overflow-hidden">
        <div className="container-shop">
          <div className="grid lg:grid-cols-[1fr_1fr] gap-12 lg:gap-20 items-center">
            {/* Logo branca grande */}
            <FadeIn>
              <Image
                src="/logo-white.png"
                alt={s.storeName ?? 'Mikma Lençóis'}
                width={800}
                height={242}
                className="w-full max-w-sm h-auto object-contain opacity-90"
              />
            </FadeIn>

            {/* Copy + stats */}
            <FadeIn delay={100}>
              <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-paper/25 mb-6">
                {s.storeCity ?? 'Blumenau'} · Est. {s.foundedYear ?? '2018'}
              </p>
              <h2 className="font-display text-paper font-normal leading-[1.06] text-3xl sm:text-4xl lg:text-[2.8rem] mb-8 text-balance">
                {s.storeSlogan ?? 'Qualidade que você sente na primeira noite.'}
              </h2>
              <div className="flex gap-3 flex-wrap mb-10">
                <Link href="/produtos" className="btn-clay-lg">Comprar agora</Link>
                <Link href="/sobre" className="btn h-14 px-8 text-[13px] font-semibold border border-paper/15 text-paper/60 hover:text-paper hover:border-paper/30 transition-all duration-150">Nossa história</Link>
              </div>

              {/* Stats em grade */}
              <div className="grid grid-cols-2 gap-px bg-paper/[0.06] border border-paper/[0.06]">
                {[
                  { value: s.statOrders ?? '1.200+', label: 'Pedidos' },
                  { value: s.statRating ?? '4.9',   label: 'Avaliação' },
                  { value: s.statDelivery ?? '< 1h', label: 'Entrega local' },
                  { value: s.statYears ?? '6 anos',  label: 'No mercado' },
                ].map(stat => (
                  <div key={stat.label} className="bg-ink px-5 py-4">
                    <p className="font-display text-2xl text-paper font-normal leading-none tracking-[-0.02em] mb-1">{stat.value}</p>
                    <p className="font-mono text-[10px] text-paper/30 tracking-[0.14em] uppercase">{stat.label}</p>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>
    </>
  );
}
