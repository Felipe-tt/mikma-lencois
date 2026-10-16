import { adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';
import Image from 'next/image';
import { serialize } from '@/lib/utils/serialize';

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

async function getCategories(): Promise<string[]> {
  try {
    const snap = await adminDb
      .collection('products')
      .where('active', '==', true)
      .select('category')
      .get();
    return Array.from(new Set(
      snap.docs.map(d => d.data().category as string).filter(Boolean)
    )).sort();
  } catch { return []; }
}

export default async function HomePage() {
  const [products, categories, s] = await Promise.all([
    getFeatured(), getCategories(), getSettings(),
  ]);

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
      {/* ═══════════════════════════════════════════════════════════
          HERO: texto à esquerda, foto nítida à direita.
          Antes a foto ficava atrás do título com 22% de opacidade: lavada,
          e o "MIKMA" da parede da foto colidia com as letras do título.
      ═══════════════════════════════════════════════════════════ */}
      <section className="bg-paper border-b border-mist overflow-hidden">
        <div className="container-shop grid lg:grid-cols-[1.08fr_0.92fr] gap-10 lg:gap-16 xl:gap-24 items-center pt-10 sm:pt-14 lg:pt-16 pb-12 sm:pb-16 lg:pb-20">

          <div className="animate-fade-up">
            <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] uppercase text-faint mb-8 sm:mb-10">
              <span className="h-px w-8 bg-clay" aria-hidden="true" />
              {city}, SC · Fábrica própria
            </p>

            <h1 className="font-display font-normal text-ink leading-[0.98] tracking-[-0.025em] text-[clamp(2.6rem,6.2vw,5.6rem)]">
              <span className="block">{heroLine1}</span>
              <span className="block italic text-clay">{heroLine2}</span>
              <span className="block">{heroLine3}</span>
            </h1>

            <p className="mt-7 sm:mt-8 text-[15px] sm:text-[17px] text-mid leading-relaxed max-w-[40ch]">
              {heroSubtitle}
            </p>

            <div className="mt-8 sm:mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
              <Link href="/produtos"
                className="group inline-flex items-center justify-center gap-2.5 h-[52px] px-8 bg-ink text-paper text-[13px] font-medium tracking-[0.06em] hover:bg-clay active:scale-[0.98] transition-[background-color,transform] duration-200">
                Ver produtos
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-200 group-hover:translate-x-1"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </Link>
              <Link href="/guia-de-tamanhos"
                className="text-[13px] text-mid hover:text-ink transition-colors duration-200 border-b border-mist-d hover:border-ink pb-0.5">
                Qual tamanho eu preciso?
              </Link>
            </div>
          </div>

          <div className="relative animate-fade-in">
            <div className="relative aspect-[4/3] sm:aspect-[16/11] lg:aspect-[4/5] overflow-hidden bg-warm">
              <Image
                src="/hero-bg.jpg"
                alt="Cama arrumada com lençóis Mikma"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover object-center"
              />
            </div>
            {/* Cartão flutuante: âncora de confiança junto da foto */}
            <div className="absolute -bottom-4 sm:-bottom-5 left-3 sm:left-6 lg:-left-8 bg-paper border border-mist px-4 py-3 sm:px-5 sm:py-4 shadow-[0_18px_40px_-24px_rgba(30,18,8,0.35)] max-w-[190px] sm:max-w-[230px]">
              <p className="font-display text-[1.25rem] sm:text-[1.6rem] leading-none text-ink">{s.foundedYear ? `Desde ${s.foundedYear}` : 'Fábrica própria'}</p>
              <p className="mt-1.5 text-[11px] sm:text-[12px] text-mid leading-snug">Costurado em {city}, sem intermediários.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Diferenciais em faixa própria, legíveis (antes eram 12px soltos
          embaixo do título). */}
      {trustItems.length > 0 && (
        <section className="bg-warm/50 border-b border-mist">
          <div className="container-shop grid grid-cols-2 lg:grid-cols-4">
            {trustItems.map((t, i) => (
              <div key={t} className={`flex items-center gap-3.5 py-5 sm:py-6 ${i % 2 === 1 ? 'pl-4 sm:pl-6' : 'pr-4'} lg:px-6 lg:first:pl-0 ${i < 2 ? 'border-b lg:border-b-0' : ''} ${i % 2 === 0 ? 'border-r' : ''} lg:border-r lg:last:border-r-0 border-mist`}>
                <span className="w-9 h-9 shrink-0 rounded-full border border-mist-d flex items-center justify-center text-clay">
                  {TRUST_ICONS[i % TRUST_ICONS.length]}
                </span>
                <span className="text-[12.5px] sm:text-[13px] text-ink font-medium leading-snug">{t}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════
          PRODUTOS, imediatamente após o hero
          Sem seção intermediária. O produto fala por si.
      ═══════════════════════════════════════════════════════════ */}
      <section className="bg-paper">
        {/* Header da seção, minimal */}
        <div className="container-shop pt-16 sm:pt-24 pb-6 sm:pb-8 flex items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-clay mb-3">Coleção</p>
            <h2 className="font-display font-normal text-ink text-[2rem] sm:text-[2.6rem] leading-[1.05] tracking-[-0.015em]">
              {s.featuredTitle || 'Destaques'}
            </h2>
          </div>
          <Link href="/produtos"
            className="group hidden sm:inline-flex items-center gap-2 text-[13px] font-medium text-mid hover:text-ink transition-colors duration-150 mb-1.5">
            Ver todos
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-200 group-hover:translate-x-0.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </Link>
        </div>

        {/* Categorias, se existirem */}
        {categories.length > 1 && (
          <nav aria-label="Categorias" className="container-shop mb-8 sm:mb-10">
            <div className="flex gap-6 sm:gap-8 overflow-x-auto scrollbar-none border-b border-mist">
              {categories.map(cat => (
                <Link key={cat}
                  href={`/produtos?categoria=${encodeURIComponent(cat)}`}
                  className="shrink-0 -mb-px py-3 text-[13px] text-mid hover:text-ink border-b border-transparent hover:border-ink transition-colors duration-200">
                  {cat}
                </Link>
              ))}
            </div>
          </nav>
        )}

        {/* Grid */}
        <div className="container-shop pb-20">
          {products.length === 0 ? (
            <div className="py-20 text-center border border-mist">
              <p className="font-display text-2xl text-faint font-normal">
                Nenhum produto cadastrado ainda.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-9 sm:gap-x-5 sm:gap-y-12">
              {products.map((p) => (
                // Grid fica abaixo do hero: sem prioridade alta (só o hero tem),
                // pra não disputar banda com o candidato a LCP.
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
          <div className="mt-8 sm:hidden text-center">
            <Link href="/produtos"
              className="inline-flex items-center justify-center h-11 px-6 border border-ink text-ink text-[13px] font-medium hover:bg-ink hover:text-paper transition-colors duration-200">
              Ver todos os produtos
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          PROPOSTA, uma frase e dois botões. Sem stats, sem grade.
          Fundo escuro como ponto final da página.
      ═══════════════════════════════════════════════════════════ */}
      <section className="theme-locked relative overflow-hidden bg-clay-d">
        {/* Lua da marca como marca d'água: preenche o lado direito, que
            antes ficava vazio. Terracota em vez de marrom escuro: a faixa
            colava no rodapé (mesma cor) e virava um bloco só. */}
        <Image
          src="/logo-moon-transparent.png"
          alt=""
          aria-hidden="true"
          width={560}
          height={560}
          className="pointer-events-none select-none absolute -right-16 sm:right-0 lg:right-[6%] top-1/2 -translate-y-1/2 w-[300px] sm:w-[420px] lg:w-[520px] h-auto brightness-0 invert opacity-[0.12]"
        />
        <div className="container-shop relative py-16 sm:py-24">
          <p className="flex items-center gap-3 font-mono text-[10px] tracking-[0.28em] uppercase text-paper/70 mb-8">
            <span className="h-px w-8 bg-paper/50" aria-hidden="true" />
            {s.foundedYear ? `${city} · Est. ${s.foundedYear}` : city}
          </p>
          <h2 className="font-display font-normal text-paper leading-[1.02] tracking-[-0.02em] mb-9 sm:mb-11 max-w-2xl text-[clamp(2.3rem,5.2vw,4.4rem)]">
            {ctaLine1}<br /><em className="text-paper/75">{ctaLine2}</em>
          </h2>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/produtos"
              className="group inline-flex items-center justify-center gap-2.5 h-[52px] px-8 bg-paper text-ink text-[13px] font-medium tracking-[0.05em] hover:bg-ink hover:text-paper active:scale-[0.98] transition-[background-color,color,transform] duration-200">
              {ctaBtn1}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-200 group-hover:translate-x-1"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </Link>
            <Link href="/sobre"
              className="inline-flex items-center justify-center h-[52px] px-8 border border-paper/40 text-paper text-[13px] font-medium hover:border-paper hover:bg-paper/10 active:scale-[0.98] transition-[background-color,border-color,transform] duration-200">
              {ctaBtn2}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
