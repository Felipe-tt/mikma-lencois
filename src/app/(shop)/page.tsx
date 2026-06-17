import { adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';
import { serialize } from '@/lib/utils/serialize';

export const dynamic = 'force-dynamic';

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

  const storeName = s.storeName || 'Mikma Lençóis';
  const city      = s.storeCity?.split(',')[0] || 'Blumenau';

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          HERO — tipografia como protagonista
          Branco absoluto. Headline enorme. Nada mais.
      ═══════════════════════════════════════════════════════════ */}
      <section className="bg-[#F9F6F1] border-b border-[#E0D8CE]">
        <div className="container-shop pt-16 sm:pt-24 pb-14 sm:pb-20">

          {/* Origem — linha de contexto, não eyebrow decorativo */}
          <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-[#9C8878] mb-10 sm:mb-14">
            {city}, SC · Fábrica própria · {new Date().getFullYear()}
          </p>

          {/* Headline — ocupa toda a largura disponível */}
          <h1
            className="font-display font-normal text-[#1E1208] leading-[0.96] tracking-[-0.025em]"
            style={{ fontSize: 'clamp(3.8rem, 9.5vw, 9rem)' }}
          >
            <span className="block">O conforto</span>
            <span className="block italic text-[#7C5C3E]">que acompanha</span>
            <span className="block">seus sonhos.</span>
          </h1>

          {/* Copy + CTA — linha única embaixo do headline */}
          <div className="mt-10 sm:mt-14 flex flex-col sm:flex-row sm:items-end justify-between gap-8">
            <p className="text-[15px] text-[#705A48] leading-relaxed max-w-[38ch] font-light">
              {s.heroSubtitle || `Direto da nossa fábrica em ${city} para a sua cama — sem intermediários, sem markup desnecessário.`}
            </p>
            <div className="flex items-center gap-5 shrink-0">
              <Link href="/produtos"
                className="inline-flex items-center justify-center h-12 px-7 bg-[#1E1208] text-[#F9F6F1] text-[13px] font-medium tracking-[0.05em] hover:bg-[#7C5C3E] transition-colors duration-200">
                Ver produtos
              </Link>
              <Link href="/sobre"
                className="text-[13px] text-[#9C8878] hover:text-[#1E1208] transition-colors duration-200 border-b border-[#D4C4AE] hover:border-[#1E1208] pb-px">
                Sobre nós
              </Link>
            </div>
          </div>

          {/* Trust — sem ícones, sem boxes, texto simples */}
          <div className="mt-10 pt-8 border-t border-[#E0D8CE] flex flex-wrap gap-x-8 gap-y-1.5">
            {[
              `Entrega em 1h em ${city}`,
              'Frete para todo o Brasil',
              'Pague com PIX',
              'Qualidade direto de fábrica',
            ].map(t => (
              <span key={t} className="font-mono text-[11px] text-[#B09C8C] tracking-[0.08em]">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          PRODUTOS — imediatamente após o hero
          Sem seção intermediária. O produto fala por si.
      ═══════════════════════════════════════════════════════════ */}
      <section className="bg-[#F9F6F1]">
        {/* Header da seção — minimal */}
        <div className="container-shop pt-14 sm:pt-20 pb-8 flex items-baseline justify-between gap-6">
          <h2 className="font-display font-normal text-[#1E1208] text-2xl sm:text-3xl">
            {s.featuredTitle || 'Destaques'}
          </h2>
          <Link href="/produtos"
            className="font-mono text-[11px] tracking-[0.14em] uppercase text-[#9C8878] hover:text-[#1E1208] transition-colors duration-150 border-b border-transparent hover:border-[#1E1208] pb-px">
            Ver todos
          </Link>
        </div>

        {/* Categorias — se existirem */}
        {categories.length > 1 && (
          <div className="container-shop pb-8 flex flex-wrap gap-2">
            {categories.map(cat => (
              <Link key={cat}
                href={`/produtos?categoria=${encodeURIComponent(cat)}`}
                className="font-mono text-[10px] tracking-[0.12em] uppercase px-3 py-1.5 border border-[#D4C4AE] text-[#9C8878] hover:border-[#1E1208] hover:text-[#1E1208] transition-colors duration-150">
                {cat}
              </Link>
            ))}
          </div>
        )}

        {/* Grid */}
        <div className="container-shop pb-20">
          {products.length === 0 ? (
            <div className="py-20 text-center border border-[#E0D8CE]">
              <p className="font-display text-2xl text-[#B09C8C] font-normal">
                Nenhum produto cadastrado ainda.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-[#E0D8CE] border border-[#E0D8CE]">
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p} priority={i < 4} />
              ))}
            </div>
          )}
          <div className="mt-8 sm:hidden text-center">
            <Link href="/produtos"
              className="inline-flex items-center justify-center h-11 px-6 border border-[#1E1208] text-[#1E1208] text-[13px] font-medium hover:bg-[#1E1208] hover:text-[#F9F6F1] transition-colors duration-200">
              Ver todos os produtos
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          PROPOSTA — uma frase e dois botões. Sem stats, sem grade.
          Fundo escuro como ponto final da página.
      ═══════════════════════════════════════════════════════════ */}
      <section className="bg-[#1E1208]">
        <div className="container-shop py-20 sm:py-28">
          <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#6B5444] mb-8">
            {city} · Est. {s.foundedYear || '2018'}
          </p>
          <h2
            className="font-display font-normal text-[#F9F6F1] leading-[1.04] tracking-[-0.02em] mb-10 sm:mb-14 max-w-2xl"
            style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)' }}
          >
            {s.storeSlogan || <>Feito em {city}.<br /><em className="text-[#A07850] not-italic">Dorme bem.</em></>}
          </h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/produtos"
              className="inline-flex items-center justify-center h-12 px-7 bg-[#7C5C3E] text-[#F9F6F1] text-[13px] font-medium tracking-[0.05em] hover:bg-[#A07850] transition-colors duration-200">
              Comprar agora
            </Link>
            <Link href="/sobre"
              className="inline-flex items-center justify-center h-12 px-7 border border-[#F9F6F1]/15 text-[#F9F6F1]/50 text-[13px] font-medium hover:text-[#F9F6F1] hover:border-[#F9F6F1]/30 transition-colors duration-200">
              Nossa história
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
