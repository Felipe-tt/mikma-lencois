'use client';

import type { StoreSettings } from '@/lib/store-settings';

/**
 * Espelha o markup real de src/components/layout/Header.tsx (topbar)
 * + src/app/(shop)/page.tsx (seção Hero). Mantenha em sincronia se o
 * site real mudar — é só um preview visual, sem lógica de carrinho/auth.
 */
export function HeroPreview({ s }: { s: StoreSettings }) {
  const city = s.storeCity?.split(',')[0] || 'Blumenau';
  const heroLine1 = s.heroLine1 || 'O conforto';
  const heroLine2 = s.heroLine2 || 'que acompanha';
  const heroLine3 = s.heroLine3 || 'seus sonhos.';
  const heroSubtitle = s.heroSubtitle || `Direto da nossa fábrica em ${city} para a sua cama, sem intermediários.`;
  const trustItems = [s.heroTrust1, s.heroTrust2, s.heroTrust3, s.heroTrust4].filter(Boolean);

  return (
    <div>
      {/* Topbar */}
      {s.topbarText && (
        <div className="bg-ink text-paper/55 text-[10px] text-center py-2 tracking-[0.22em] uppercase font-medium">
          {s.topbarText}
        </div>
      )}

      {/* Mini header fake — só pra dar contexto visual, sem navegação real */}
      <div className="h-[60px] border-b border-[#E4DED5] flex items-center px-6 bg-white dark:bg-warm">
        <div className="h-6 w-28 bg-ink/10 rounded-sm" />
        <div className="flex-1" />
        <div className="flex items-center gap-4">
          <div className="h-3 w-14 bg-ink/10 rounded-sm" />
          <div className="h-3 w-10 bg-ink/10 rounded-sm" />
        </div>
      </div>

      {/* Hero */}
      <section className="border-b border-mist relative overflow-hidden bg-paper">
        <div className="px-6 sm:px-10 pt-12 sm:pt-16 pb-10 sm:pb-14 relative">
          <p className="font-mono text-[10px] sm:text-[11px] tracking-[0.22em] uppercase text-faint mb-8 sm:mb-10">
            {city}, SC · Fábrica própria · {new Date().getFullYear()}
          </p>

          <h1
            className="font-display font-normal text-ink leading-[0.96] tracking-[-0.025em] text-[clamp(2.2rem,7vw,4.5rem)]"
          >
            <span className="block">{heroLine1}</span>
            <span className="block italic text-mid">{heroLine2}</span>
            <span className="block">{heroLine3}</span>
          </h1>

          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <p className="text-[14px] text-mid leading-relaxed max-w-[38ch] font-light">
              {heroSubtitle}
            </p>
            <div className="flex items-center gap-4 shrink-0">
              <span className="inline-flex items-center justify-center h-10 px-5 bg-ink text-paper text-[12px] font-medium tracking-[0.05em]">
                Ver produtos
              </span>
              <span className="text-[12px] text-faint border-b border-faint-l pb-px">
                Sobre nós
              </span>
            </div>
          </div>

          {trustItems.length > 0 && (
            <div className="mt-8 pt-6 border-t border-mist flex flex-wrap gap-x-6 gap-y-1.5">
              {trustItems.map((t, i) => (
                <span key={i} className="font-mono text-[10px] text-faint tracking-[0.08em]">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** Espelha a seção de produtos em destaque (título + link) — só o cabeçalho, sem produtos reais */
export function FeaturedPreview({ s }: { s: StoreSettings }) {
  return (
    <section className="bg-paper">
      <div className="px-6 sm:px-10 pt-10 sm:pt-14 pb-6 flex items-baseline justify-between gap-6">
        <h2 className="font-display font-normal text-ink text-xl sm:text-2xl">
          {s.featuredTitle || 'Destaques'}
        </h2>
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-faint border-b border-transparent pb-px">
          Ver todos
        </span>
      </div>
      <div className="px-6 sm:px-10 pb-14">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-mist border border-mist">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-warm aspect-[3/4] flex items-center justify-center">
              <span className="font-display text-mist text-3xl">M</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Espelha a seção escura final (CTA) da homepage */
export function CtaPreview({ s }: { s: StoreSettings }) {
  const city = s.storeCity?.split(',')[0] || 'Blumenau';
  const ctaLine1 = s.ctaSloganLine1 || `Feito em ${city}.`;
  const ctaLine2 = s.ctaSloganLine2 || 'Dorme bem.';
  const ctaBtn1 = s.ctaBtn1 || 'Comprar agora';
  const ctaBtn2 = s.ctaBtn2 || 'Nossa história';

  return (
    <section className="bg-ink">
      <div className="px-6 sm:px-10 py-12 sm:py-16">
        <p className="font-mono text-[9px] tracking-[0.28em] uppercase text-mid mb-6">
          {city} · Est. {s.foundedYear || ''}
        </p>
        <h2
          className="font-display font-normal text-paper leading-[1.04] tracking-[-0.02em] mb-7 max-w-2xl text-[clamp(1.6rem,4.5vw,3rem)]"
        >
          {ctaLine1}<br /><em className="text-clay-d not-italic">{ctaLine2}</em>
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <span className="inline-flex items-center justify-center h-10 px-5 bg-mid text-paper text-[12px] font-medium tracking-[0.05em]">
            {ctaBtn1}
          </span>
          <span className="inline-flex items-center justify-center h-10 px-5 border border-paper/15 text-paper/50 text-[12px] font-medium">
            {ctaBtn2}
          </span>
        </div>
      </div>
    </section>
  );
}
