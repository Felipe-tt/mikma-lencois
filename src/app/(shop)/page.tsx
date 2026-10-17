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
          HERO: foto da cama em tela cheia, com um degradê na cor do fundo
          vindo da esquerda pro texto ler bem. A parede com o "MIKMA" fica
          do lado direito, longe do título.
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-paper">
        {/* No desktop a foto ocupa só os 70% da direita: o "MIKMA" da
            parede fica longe do título. */}
        <div className="hidden lg:block absolute inset-y-0 right-0 left-[30%] pointer-events-none select-none overflow-hidden">
          <Image
            src="/hero-bg.jpg"
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="70vw"
            className="object-cover object-center animate-hero-zoom"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-paper from-0% via-paper/50 via-35% to-paper/0 to-70%" />
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
            <Image src="/hero-bg.jpg" alt="Cama arrumada com lençóis Mikma" fill priority sizes="100vw" className="object-cover object-[60%_center]" />
          </div>

          {/* Diferenciais em pílulas translúcidas no pé do hero */}
          {trustItems.length > 0 && (
            <ul className="mt-6 sm:mt-10 lg:mt-auto lg:pt-12 grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-2.5 animate-fade-in">
              {trustItems.map((t, i) => (
                <li key={t} className="flex sm:inline-flex items-center gap-2.5 rounded-2xl sm:rounded-full border border-mist-d/60 bg-paper/75 backdrop-blur-md p-2.5 sm:pl-1.5 sm:pr-4 sm:py-1.5 text-[12px] sm:text-[12.5px] leading-snug text-ink">
                  <span className="w-7 h-7 rounded-full bg-clay/10 text-clay flex items-center justify-center shrink-0" aria-hidden="true">
                    {TRUST_ICONS[i % TRUST_ICONS.length]}
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

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

        {/* Categorias em pílulas arredondadas */}
        {categories.length > 1 && (
          <nav aria-label="Categorias" className="container-shop mb-8 sm:mb-10">
            <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 py-1 pr-8 sm:pr-1 [mask-image:linear-gradient(to_right,black_82%,transparent)] sm:[mask-image:none]">
              <Link href="/produtos"
                className="shrink-0 h-9 px-4 inline-flex items-center rounded-full bg-ink text-paper text-[13px] font-medium">
                Todos
              </Link>
              {categories.map(cat => (
                <Link key={cat}
                  href={`/produtos?categoria=${encodeURIComponent(cat)}`}
                  className="shrink-0 h-9 px-4 inline-flex items-center rounded-full border border-mist-d text-[13px] text-mid hover:text-ink hover:border-ink hover:bg-warm transition-colors duration-200">
                  {cat}
                </Link>
              ))}
            </div>
          </nav>
        )}

        {/* Grid */}
        <div className="container-shop pb-20">
          {products.length === 0 ? (
            <div className="py-20 text-center border border-mist rounded-2xl">
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
              className="inline-flex items-center justify-center h-11 px-6 rounded-full border border-ink text-ink text-[13px] font-medium hover:bg-ink hover:text-paper transition-colors duration-200">
              Ver todos os produtos
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          PROPOSTA: cartão escuro arredondado, solto do rodapé (antes era
          uma faixa terracota de ponta a ponta colada nele).
      ═══════════════════════════════════════════════════════════ */}
      <section className="bg-paper pb-16 sm:pb-24">
        <div className="container-shop">
          <div className="theme-locked relative overflow-hidden rounded-[28px] bg-ink px-7 py-14 sm:px-14 sm:py-20 lg:px-20">
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
