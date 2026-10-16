import { adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';
import Image from 'next/image';
import { serialize } from '@/lib/utils/serialize';

export const revalidate = 900; // ISR: revalida a cada 15 minutos

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
          HERO, tipografia como protagonista
          Branco absoluto. Headline enorme. Nada mais.
      ═══════════════════════════════════════════════════════════ */}
      <section className="border-b border-mist relative overflow-hidden bg-paper">
        <div className="absolute inset-0 pointer-events-none select-none z-0">
          <Image
            src="/hero-bg.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center opacity-[0.22]"
            aria-hidden="true"
          />
        </div>
        <div className="container-shop pt-16 sm:pt-24 pb-14 sm:pb-20 relative z-[2]">

          {/* Origem, linha de contexto, não eyebrow decorativo */}
          <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-faint mb-10 sm:mb-14">
            {city}, SC · Fábrica própria · {new Date().getFullYear()}
          </p>

          {/* Headline, ocupa toda a largura disponível */}
          <h1
            className="font-display font-normal text-ink leading-[0.96] tracking-[-0.025em] text-[clamp(2.75rem,9.5vw,9rem)]"
          >
            <span className="block">{heroLine1}</span>
            <span className="block italic text-mid">{heroLine2}</span>
            <span className="block">{heroLine3}</span>
          </h1>

          {/* Copy + CTA, linha única embaixo do headline */}
          {/* Texto e botões juntos, alinhados à esquerda com o título: antes o
              botão ficava sozinho na ponta direita, longe do que ele chama. */}
          <div className="mt-8 sm:mt-10 flex flex-col items-start gap-7">
            <p className="text-[15px] sm:text-[16px] text-mid leading-relaxed max-w-[42ch] font-light">
              {heroSubtitle}
            </p>
            <div className="flex items-center gap-6">
              <Link href="/produtos"
                className="group inline-flex items-center justify-center gap-2 h-12 px-7 bg-ink text-paper text-[13px] font-medium tracking-[0.05em] hover:bg-clay active:scale-[0.98] transition-[background-color,transform] duration-200">
                Ver produtos
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-200 group-hover:translate-x-0.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </Link>
              <Link href="/sobre"
                className="text-[13px] text-mid hover:text-ink transition-colors duration-200 border-b border-mist-d hover:border-ink pb-px">
                Sobre nós
              </Link>
            </div>
          </div>

          {/* Trust strip, 4 pilares com ícone + separador */}
          {trustItems.length > 0 && (
            <div className="mt-12 pt-8 border-t border-mist-d/70">
              <div className="grid grid-cols-2 gap-y-4 gap-x-4 sm:flex sm:flex-wrap sm:gap-x-0">
                {trustItems.map((t, i) => (
                  <div key={t} className="flex items-center">
                    <div className="flex items-center gap-2.5 sm:pr-10">
                      <span className="text-mid shrink-0">
                        {i === 0 && (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                          </svg>
                        )}
                        {i === 1 && (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                          </svg>
                        )}
                        {i === 2 && (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                          </svg>
                        )}
                        {i === 3 && (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                          </svg>
                        )}
                      </span>
                      <span className="text-[12px] text-mid font-medium tracking-[0.02em] leading-snug">{t}</span>
                    </div>
                    {i < trustItems.length - 1 && (
                      <span className="h-4 w-px bg-mist-d mr-10 shrink-0 hidden sm:block" />
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
        <div className="container-shop pt-14 sm:pt-20 pb-8 flex items-baseline justify-between gap-6">
          <h2 className="font-display font-normal text-ink text-2xl sm:text-3xl">
            {s.featuredTitle || 'Destaques'}
          </h2>
          <Link href="/produtos"
            className="text-[13px] font-medium text-mid hover:text-ink transition-colors duration-150 border-b border-mist-d hover:border-ink pb-px">
            Ver todos
          </Link>
        </div>

        {/* Categorias, se existirem */}
        {categories.length > 1 && (
          <div className="container-shop pb-8 flex flex-wrap gap-2">
            {categories.map(cat => (
              <Link key={cat}
                href={`/produtos?categoria=${encodeURIComponent(cat)}`}
                className="text-[12px] font-medium px-4 py-2 border border-mist-d text-mid hover:border-ink hover:text-ink hover:bg-warm active:scale-[0.97] transition-[background-color,border-color,color,transform] duration-150">
                {cat}
              </Link>
            ))}
          </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-mist border border-mist">
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
      <section className="theme-locked bg-ink">
        <div className="container-shop py-14 sm:py-20">
          <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-paper/55 mb-8">
            {s.foundedYear ? `${city} · Est. ${s.foundedYear}` : city}
          </p>
          <h2
            className="font-display font-normal text-paper leading-[1.04] tracking-[-0.02em] mb-8 sm:mb-10 max-w-2xl text-[clamp(2.2rem,5vw,4rem)]"
          >
            {ctaLine1}<br /><em className="text-clay-l not-italic">{ctaLine2}</em>
          </h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/produtos"
              className="inline-flex items-center justify-center h-12 px-7 bg-paper text-ink text-[13px] font-medium tracking-[0.05em] hover:bg-clay-l active:scale-[0.98] transition-[background-color,transform] duration-200">
              {ctaBtn1}
            </Link>
            <Link href="/sobre"
              className="inline-flex items-center justify-center h-12 px-7 border border-paper/30 text-paper/85 text-[13px] font-medium hover:text-paper hover:border-paper/60 active:scale-[0.98] transition-[border-color,color,transform] duration-200">
              {ctaBtn2}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
