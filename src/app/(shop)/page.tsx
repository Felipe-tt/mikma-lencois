import { adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';
import Image, { getImageProps } from 'next/image';
import { serialize } from '@/lib/utils/serialize';
import { AggregateField } from 'firebase-admin/firestore';
import type { Review } from '@/types';
import { toPublicReview } from '@/lib/reviews';
import { CategoryTiles } from '@/components/home/CategoryTiles';
import { FabricGuide } from '@/components/home/FabricGuide';
import { OriginSection } from '@/components/home/OriginSection';
import { HomeReviews } from '@/components/home/HomeReviews';

// Foto do hero: uma versão de fundo no desktop e um cartão no celular. As
// duas eram "priority" e o navegador baixava as duas em qualquer tela. Agora
// as <img> são lazy (a escondida com display:none nunca baixa) e cada tela
// pré-carrega só a sua, pelo media do <link rel="preload">.
const HERO_SIZES_DESKTOP = '70vw';
const HERO_SIZES_MOBILE = '100vw';
const heroDesktop = getImageProps({ src: '/hero-bg.jpg', alt: '', fill: true, sizes: HERO_SIZES_DESKTOP }).props;
const heroMobile = getImageProps({ src: '/hero-bg.jpg', alt: '', fill: true, sizes: HERO_SIZES_MOBILE }).props;

export const revalidate = 900; // ISR: revalida a cada 15 minutos

const ICON = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const TRUST_ICONS = [
  <svg key="a" {...ICON}><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>,
  <svg key="b" {...ICON}><rect x="1" y="4" width="14" height="12"/><polygon points="15 8 19.5 8 23 11.5 23 16 15 16 15 8"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/></svg>,
  <svg key="c" {...ICON}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
  <svg key="d" {...ICON}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
];

async function getFeatured(): Promise<Product[]> {
  try {
    const snap = await adminDb
      .collection('products')
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(8)
      .get();
    return snap.docs.map(d => serialize<Product>({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// Uma leitura leve do catálogo inteiro (só os campos usados) pra montar as
// categorias com foto, a lista de tecidos e os nomes nas avaliações.
type CatalogItem = Pick<Product, 'id' | 'name' | 'category' | 'images' | 'variants'>;
async function getCatalog(): Promise<CatalogItem[]> {
  try {
    const snap = await adminDb
      .collection('products')
      .where('active', '==', true)
      .select('name', 'category', 'images', 'variants')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<CatalogItem, 'id'>) }));
  } catch { return []; }
}

async function getReviews(): Promise<{ list: Review[]; average: number; total: number }> {
  try {
    const col = adminDb.collection('reviews');
    const [snap, agg] = await Promise.all([
      col.orderBy('createdAt', 'desc').limit(40).get(),
      col.aggregate({ avg: AggregateField.average('rating'), n: AggregateField.count() }).get(),
    ]);
    const data = agg.data();
    return {
      list: snap.docs.map(d => serialize<Review>({ id: d.id, ...d.data() })),
      average: data.avg ?? 0,
      total: data.n ?? 0,
    };
  } catch { return { list: [], average: 0, total: 0 }; }
}

export default async function HomePage() {
  const [products, catalog, reviewData, s] = await Promise.all([
    getFeatured(), getCatalog(), getReviews(), getSettings(),
  ]);

  // Categorias por quantidade de peças, cada uma com a foto da primeira.
  const byCategory = new Map<string, { count: number; image?: string }>();
  for (const p of catalog) {
    if (!p.category) continue;
    const c = byCategory.get(p.category) ?? { count: 0 };
    c.count++;
    c.image ??= p.images?.[0];
    byCategory.set(p.category, c);
  }
  const categoryTiles = [...byCategory].map(([name, c]) => ({ name, ...c })).sort((a, b) => b.count - a.count);

  // Tecidos do catálogo, do mais vendido em peças pro menos.
  const fabricCount = new Map<string, number>();
  for (const p of catalog) {
    for (const f of new Set((p.variants ?? []).map(v => v.fabric?.trim()).filter(Boolean))) {
      const key = f.charAt(0).toUpperCase() + f.slice(1);
      fabricCount.set(key, (fabricCount.get(key) ?? 0) + 1);
    }
  }
  const fabrics = [...fabricCount].sort((a, b) => b[1] - a[1]).map(([f]) => f);

  const productName = new Map(catalog.map(p => [p.id, p.name]));
  const reviews = reviewData.list
    .filter(r => r.rating >= 4 && (r.comment ?? '').trim().length >= 20 && productName.has(r.productId))
    .map(r => ({ ...toPublicReview(r), productName: productName.get(r.productId) }));
  const reviewsAvg = reviewData.average;
  const reviewsTotal = reviewData.total;

  const city      = s.storeCity?.split(',')[0] || 'Blumenau';

  // Hero lines, fallback vazio para forçar admin a preencher nas configs
  const heroLine1 = s.heroLine1 || 'O conforto';
  const heroLine2 = s.heroLine2 || 'que acompanha';
  const heroLine3 = s.heroLine3 || 'seus sonhos.';
  const heroSubtitle = s.heroSubtitle || `Direto da nossa fábrica em ${city} para a sua cama, sem intermediários.`;
  const trustItems = [
    s.heroTrust1 || `Entrega em 1h em ${city}`,
    s.heroTrust2 || 'Frete para todo o Brasil',
    s.heroTrust3 || 'Pague com PIX',
    s.heroTrust4 || 'Qualidade direto de fábrica',
  ].filter(Boolean);
  const ctaLine1 = s.ctaSloganLine1 || `Feito em ${city}.`;
  const ctaLine2 = s.ctaSloganLine2 || 'Dorme bem.';
  const ctaBtn1  = s.ctaBtn1 || 'Comprar agora';
  const ctaBtn2  = s.ctaBtn2 || 'Nossa história';

  return (
    <>
      <link rel="preload" as="image" imageSrcSet={heroDesktop.srcSet} imageSizes={HERO_SIZES_DESKTOP} media="(min-width: 1024px)" fetchPriority="high" />
      <link rel="preload" as="image" imageSrcSet={heroMobile.srcSet} imageSizes={HERO_SIZES_MOBILE} media="(max-width: 1023.98px)" fetchPriority="high" />
      {/* ═══════════════════════════════════════════════════════════
          HERO: foto da cama em tela cheia, com um degradê na cor do fundo
          vindo da esquerda pro texto ler bem. A parede com o "MIKMA" fica
          do lado direito, longe do título.
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-paper">
        {/* No desktop a foto começa a partir da coluna do texto (não de uma
            % da tela) e termina num quadro de no máximo 1920px: em telas
            ultrawide ela começava muito à esquerda, embaixo do título, e
            sobrava uma faixa vazia enorme. */}
        <div className="hidden lg:block absolute inset-y-0 pointer-events-none select-none overflow-hidden left-[calc(max(0px,50%-var(--shop-max)/2)+min(100%,var(--shop-max))*0.34)] right-[max(0px,50%-960px)]">
          <Image
            src="/hero-bg.jpg"
            alt=""
            aria-hidden="true"
            fill
            loading="lazy"
            fetchPriority="high"
            sizes={HERO_SIZES_DESKTOP}
            className="object-cover object-center animate-hero-zoom"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-paper from-0% via-paper/50 via-30% to-paper/0 to-60%" />
          {/* Borda direita some no fundo quando a tela passa de 1920px */}
          <div className="hidden min-[1921px]:block absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-paper to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-paper to-transparent" />
        </div>

        <div className="container-shop relative pt-14 sm:pt-20 lg:pt-20 pb-10 sm:pb-14 lg:min-h-[min(84vh,760px)] flex flex-col">
          <div className="max-w-[760px] animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-mist-d/70 bg-paper/70 backdrop-blur-sm px-3.5 py-1.5 text-[11px] font-medium tracking-[0.08em] text-mid mb-8 sm:mb-10">
              <span className="w-1.5 h-1.5 rounded-full bg-clay" aria-hidden="true" />
              {city}, SC · Fábrica própria{s.foundedYear ? ` desde ${s.foundedYear}` : ''}
            </p>

            <h1 className="font-display font-normal text-ink leading-[0.98] tracking-[-0.025em] text-[clamp(2.7rem,6.4vw,5.6rem)]">
              <span className="block">{heroLine1}</span>
              <span className="block italic text-clay">{heroLine2}</span>
              <span className="block">{heroLine3}</span>
            </h1>

            <p className="mt-7 sm:mt-8 text-[15px] sm:text-[17px] text-mid leading-relaxed max-w-[40ch]">
              {heroSubtitle}
            </p>

            <div className="mt-8 sm:mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/produtos"
                className="group inline-flex items-center justify-center gap-2.5 h-[52px] pl-7 pr-2 rounded-full bg-ink text-paper text-[13.5px] font-medium tracking-[0.02em] shadow-[0_14px_30px_-14px_rgba(30,18,8,0.55)] hover:bg-clay active:scale-[0.98] transition-[background-color,transform] duration-200">
                Ver produtos
                <span className="w-9 h-9 rounded-full bg-paper/15 flex items-center justify-center transition-transform duration-200 group-hover:translate-x-0.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </span>
              </Link>
              <Link href="/guia-de-tamanhos"
                className="text-[13.5px] text-mid hover:text-ink transition-colors duration-200 underline decoration-mist-d underline-offset-[6px] hover:decoration-ink">
                Qual tamanho eu preciso?
              </Link>
            </div>
          </div>

          {/* No celular a foto vira um cartão nítido abaixo do texto (de
              fundo ela ficava lavada pelo degradê e quase sumia). */}
          <div className="lg:hidden relative mt-10 aspect-[4/3] sm:aspect-[16/9] rounded-3xl overflow-hidden bg-warm animate-fade-in">
            <Image src="/hero-bg.jpg" alt="Cama arrumada com lençóis Mikma" fill loading="lazy" fetchPriority="high" sizes={HERO_SIZES_MOBILE} className="object-cover object-[60%_center]" />
          </div>

          {/* Prova social discreta no pé do hero, só com avaliação real. */}
          {reviewsTotal >= 3 && (
            <a href="#avaliacoes-titulo" className="mt-8 lg:mt-auto lg:pt-12 self-start inline-flex items-center gap-2.5 text-[13px] text-mid hover:text-ink transition-colors animate-fade-in">
              <span className="inline-flex gap-0.5 text-clay" aria-hidden="true">
                {[0, 1, 2, 3, 4].map(i => <svg key={i} width="13" height="13" viewBox="0 0 24 24" className="fill-current"><path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6L2.5 9.5l6.6-.8z"/></svg>)}
              </span>
              <span><strong className="font-semibold text-ink">{reviewsAvg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong> de 5 · {reviewsTotal} avaliações de clientes</span>
            </a>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          DIFERENCIAIS: uma faixa calma logo abaixo do hero, em vez das
          pílulas que disputavam atenção com o título.
      ═══════════════════════════════════════════════════════════ */}
      {trustItems.length > 0 && (
        <section aria-label="Por que comprar na Mikma" className="bg-paper">
          <div className="container-shop">
            <ul className="grid grid-cols-2 lg:grid-cols-4 border-y border-mist divide-mist [&>li]:border-mist max-lg:[&>li:nth-child(odd)]:border-r max-lg:[&>li:nth-child(-n+2)]:border-b lg:divide-x">
              {trustItems.map((t, i) => (
                <li key={t} className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3.5 px-3 sm:px-6 py-5 sm:py-6 first:pl-0 max-lg:[&:nth-child(3)]:pl-0">
                  <span className="w-10 h-10 rounded-full bg-clay/10 text-clay flex items-center justify-center shrink-0" aria-hidden="true">
                    {TRUST_ICONS[i % TRUST_ICONS.length]}
                  </span>
                  <span className="text-[13px] sm:text-[14px] leading-snug text-ink">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <CategoryTiles categories={categoryTiles} />

      {/* ═══════════════════════════════════════════════════════════
          NOVIDADES
      ═══════════════════════════════════════════════════════════ */}
      <section aria-labelledby="novidades-titulo" className="bg-paper">
        <div className="container-shop py-20 sm:py-28">
          <div className="flex items-end justify-between gap-6 mb-8 sm:mb-10">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-clay mb-4">Acabou de chegar</p>
              <h2 id="novidades-titulo" className="font-display font-normal text-ink leading-[1.05] tracking-[-0.02em] text-[clamp(2rem,4vw,3.2rem)]">
                Novidades da fábrica
              </h2>
            </div>
            <Link href="/produtos" className="hidden sm:inline-flex shrink-0 items-center gap-1.5 h-10 text-[13px] font-medium text-mid hover:text-ink transition-colors">
              Ver todos
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </Link>
          </div>
          {products.length === 0 ? (
            <div className="py-20 text-center border border-mist rounded-2xl">
              <p className="font-display text-2xl text-faint font-normal">Nenhum produto cadastrado ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-9 sm:gap-x-5 sm:gap-y-12">
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
          <div className="mt-10 sm:hidden text-center">
            <Link href="/produtos"
              className="inline-flex items-center justify-center h-11 px-6 rounded-full border border-ink text-ink text-[13px] font-medium hover:bg-ink hover:text-paper transition-colors duration-200">
              Ver todos os produtos
            </Link>
          </div>
        </div>
      </section>

      <FabricGuide fabrics={fabrics} />
      <OriginSection city={city} foundedYear={s.foundedYear} />
      <HomeReviews reviews={reviews} average={reviewsAvg} total={reviewsTotal} />

      {/* ═══════════════════════════════════════════════════════════
          PROPOSTA: cartão escuro arredondado, solto do rodapé (antes era
          uma faixa terracota de ponta a ponta colada nele).
      ═══════════════════════════════════════════════════════════ */}
      <section className="bg-paper pb-16 sm:pb-24">
        <div className="container-shop">
          {/* Sombra funda e um brilho terracota no canto: no tema escuro o
              cartão tinha a mesma cor do fundo e virava um bloco chapado. */}
          <div className="theme-locked relative overflow-hidden rounded-[28px] bg-ink px-7 py-14 sm:px-14 sm:py-20 lg:px-20 ring-1 ring-black/5 dark:ring-white/[0.07] shadow-[0_40px_90px_-40px_rgba(30,18,8,0.55)] dark:shadow-[0_40px_100px_-30px_rgba(0,0,0,0.85)]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_100%_0%,rgba(204,122,71,0.22),transparent_60%)]" />
            <Image
              src="/logo-moon-transparent.png"
              alt=""
              aria-hidden="true"
              width={560}
              height={560}
              className="pointer-events-none select-none absolute -right-20 sm:right-[4%] top-1/2 -translate-y-1/2 w-[300px] sm:w-[400px] lg:w-[460px] h-auto brightness-0 invert opacity-[0.07]"
            />
            <div className="relative">
              <p className="inline-flex items-center gap-2 rounded-full border border-paper/15 px-3.5 py-1.5 text-[11px] font-medium tracking-[0.08em] text-paper/70 mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-clay-l" aria-hidden="true" />
                {s.foundedYear ? `${city} · desde ${s.foundedYear}` : city}
              </p>
              <h2 className="font-display font-normal text-paper leading-[1.02] tracking-[-0.02em] mb-9 sm:mb-11 max-w-2xl text-[clamp(2.3rem,5vw,4.2rem)]">
                {ctaLine1}<br /><em className="text-clay-l">{ctaLine2}</em>
              </h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/produtos"
                  className="group inline-flex items-center justify-center gap-2.5 h-[52px] px-8 rounded-full bg-paper text-ink text-[13.5px] font-medium hover:bg-clay-l active:scale-[0.98] transition-[background-color,transform] duration-200">
                  {ctaBtn1}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-200 group-hover:translate-x-1"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </Link>
                <Link href="/sobre"
                  className="inline-flex items-center justify-center h-[52px] px-8 rounded-full border border-paper/25 text-paper text-[13.5px] font-medium hover:border-paper/60 hover:bg-paper/[0.06] active:scale-[0.98] transition-[background-color,border-color,transform] duration-200">
                  {ctaBtn2}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
