import { getCatalog } from '@/lib/catalog';
import { getStoreSettings } from '@/lib/settings';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';
import Image from 'next/image';

// Prerender parcial: a página sai pronta do cache; o catálogo e as
// configurações vêm de funções 'use cache' que o painel limpa ao salvar.
async function getHomeData(): Promise<{ products: Product[]; categories: string[] }> {
  try {
    const all = await getCatalog();
    const categories = Array.from(new Set(all.map(p => p.category).filter(Boolean))).sort();
    return { products: all.slice(0, 8), categories };
  } catch { return { products: [], categories: [] }; }
}

export default async function HomePage() {
  const [{ products, categories }, s] = await Promise.all([getHomeData(), getStoreSettings()]);

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
          HERO: a foto do quarto em tela cheia, texto claro por cima.
          Antes a foto ficava com 22% de opacidade atrás de um texto escuro
          (bege sobre bege, a placa "Mikma" da parede brigava com o título).
          theme-locked: o hero é sempre escuro com texto claro, nos dois temas.
      ═══════════════════════════════════════════════════════════ */}
      <section className="theme-locked relative isolate overflow-hidden bg-ink">
        <Image
          src="/hero-mikma.jpg"
          alt="Quarto com cama arrumada com lençóis claros e a placa Mikma Lençóis na parede"
          fill
          priority
          // É o maior elemento da primeira tela (o LCP do Google): sem isso
          // o navegador baixava com prioridade baixa, junto das fotos dos
          // produtos que ficam abaixo da dobra.
          fetchPriority="high"
          sizes="100vw"
          className="object-cover object-[51%_35%] sm:object-[55%_40%] -z-10"
        />
        {/* Escurece de baixo pra cima (e da esquerda no computador) só onde
            fica o texto; o meio da foto continua luminoso. */}
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/90 via-ink/40 to-ink/5 sm:bg-gradient-to-r sm:from-ink/80 sm:via-ink/35 sm:to-transparent" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 -z-10 hidden sm:block bg-gradient-to-t from-ink/60 to-transparent" />

        <div className="container-shop flex flex-col justify-end min-h-[calc(86svh-56px)] sm:min-h-[min(calc(92vh-60px),880px)] pt-32 pb-10 sm:pb-16">
          <p className="text-[11px] font-medium tracking-[0.24em] uppercase text-paper/75 mb-5 sm:mb-7">
            {city}, SC · Fábrica própria
          </p>

          <h1 className="font-display font-normal text-paper leading-[0.98] tracking-[-0.02em] text-[clamp(3rem,8.2vw,7.25rem)] max-w-[14ch] [text-wrap:balance]">
            <span className="block">{heroLine1}</span>
            <span className="block italic text-[#EBC9A6]">{heroLine2}</span>
            <span className="block">{heroLine3}</span>
          </h1>

          <div className="mt-7 sm:mt-10 flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10">
            <p className="text-[15.5px] sm:text-[17px] text-paper/85 leading-relaxed max-w-[36ch] text-pretty">
              {heroSubtitle}
            </p>
            <div className="flex items-center gap-6 shrink-0">
              <Link href="/produtos"
                className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-paper text-ink text-[14px] font-semibold hover:bg-warm active:scale-[0.98] transition-[background-color,transform] duration-200">
                Ver produtos
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </Link>
              <Link href="/sobre"
                className="relative before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] text-[14px] font-medium text-paper/85 hover:text-paper transition-colors duration-200 border-b border-paper/40 hover:border-paper pb-0.5">
                Nossa fábrica
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Faixa de confiança logo abaixo da foto, sobre o fundo da página. */}
      <section aria-label="Vantagens" className="border-b border-mist bg-paper">
        <div className="container-shop">
          {trustItems.length > 0 && (
            <div className="py-5 sm:py-6">
              {/* Celular: grade 2x2 alinhada (antes quebrava linha no meio). */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:flex-wrap sm:gap-y-4 sm:gap-x-0">
                {trustItems.map((t, i) => (
                  <div key={t} className="flex items-center min-w-0">
                    <div className="flex items-center gap-2.5 min-w-0 sm:pr-10">
                      <span className="text-mid shrink-0">
                        {i === 0 && (
                          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                          </svg>
                        )}
                        {i === 1 && (
                          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                          </svg>
                        )}
                        {i === 2 && (
                          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                          </svg>
                        )}
                        {i === 3 && (
                          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                          </svg>
                        )}
                      </span>
                      <span className="text-[12px] leading-snug text-ink/80 font-medium tracking-[0.02em]">{t}</span>
                    </div>
                    {i < trustItems.length - 1 && (
                      <span className="h-4 w-px bg-faint-l mr-10 shrink-0 hidden sm:block" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          PRODUTOS, imediatamente após o hero
          Sem seção intermediária. O produto fala por si.
      ═══════════════════════════════════════════════════════════ */}
      <section className="bg-paper">
        {/* Header da seção, minimal */}
        <div className="container-shop pt-14 sm:pt-20 pb-7 flex items-end justify-between gap-6">
          <h2 className="font-display font-normal text-ink text-[1.85rem] sm:text-[2.75rem] leading-[1.05] tracking-[-0.015em]">
            {s.featuredTitle || 'Destaques'}
          </h2>
          <Link href="/produtos"
            className="relative shrink-0 whitespace-nowrap mb-1 before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] font-semibold text-[11px] tracking-[0.14em] uppercase text-faint hover:text-ink transition-colors duration-150 border-b border-transparent hover:border-ink pb-px">
            Ver todos
          </Link>
        </div>

        {/* Categorias, se existirem */}
        {categories.length > 1 && (
          <div className="container-shop pb-8 sm:pb-10 flex gap-2 overflow-x-auto scrollbar-none sm:flex-wrap">
            {categories.map(cat => (
              <Link key={cat}
                href={`/produtos?categoria=${encodeURIComponent(cat)}`}
                className="shrink-0 inline-flex items-center h-10 px-4 rounded-full border border-mist-d text-[13px] text-mid hover:border-ink hover:text-ink transition-colors duration-150">
                {cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase()}
              </Link>
            ))}
          </div>
        )}

        {/* Grid */}
        <div className="container-shop pb-20">
          {products.length === 0 ? (
            <div className="py-20 text-center rounded-3xl border border-mist">
              <p className="font-display text-2xl text-faint font-normal">
                Nenhum produto cadastrado ainda.
              </p>
            </div>
          ) : (
            /* Mesma grade da página de produtos: o cartão é arredondado e tem
               fundo próprio (a grade antiga, de linhas de 1px sobre fundo
               bege, espremia os cartões e encavalava as cores no preço). */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-9">
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p} priority={i < 4} />
              ))}
            </div>
          )}
          <div className="mt-10 sm:hidden text-center">
            <Link href="/produtos"
              className="inline-flex items-center justify-center h-12 px-7 rounded-full border border-ink text-ink text-[13px] font-medium hover:bg-ink hover:text-paper transition-colors duration-200">
              Ver todos os produtos
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          PROPOSTA, uma frase e dois botões. Sem stats, sem grade.
          Fundo escuro como ponto final da página.
      ═══════════════════════════════════════════════════════════ */}
      <section className="bg-warm border-t border-mist">
        {/* Centralizado: alinhado à esquerda sobrava metade da faixa vazia. */}
        <div className="container-shop py-14 sm:py-20 text-center">
          <p className="font-semibold text-[11px] tracking-[0.24em] uppercase text-faint mb-6">
            {s.foundedYear ? `${city} · Desde ${s.foundedYear}` : `${city} · Fábrica própria`}
          </p>
          <h2
            className="font-display font-normal text-ink leading-[1.04] tracking-[-0.02em] mb-8 sm:mb-10 max-w-2xl mx-auto text-[clamp(2.4rem,5.5vw,4.5rem)]"
          >
            {ctaLine1}<br /><em className="text-clay">{ctaLine2}</em>
          </h2>
          <div className="flex flex-col sm:flex-row sm:justify-center gap-4">
            <Link href="/produtos"
              className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-ink text-paper text-[14px] font-semibold hover:bg-clay active:scale-[0.98] transition-[background-color,transform] duration-200">
              {ctaBtn1}
            </Link>
            <Link href="/sobre"
              className="inline-flex items-center justify-center h-12 px-7 rounded-full border border-ink/20 text-ink text-[14px] font-medium hover:border-ink/50 hover:bg-paper transition-colors duration-200">
              {ctaBtn2}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
