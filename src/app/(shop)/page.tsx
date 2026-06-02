import { adminDb } from '@/lib/firebase/admin';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getFeaturedProducts(): Promise<Product[]> {
  try {
    const snap = await adminDb
      .collection('products')
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(8)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
  } catch { return []; }
}

export default async function HomePage() {
  const products = await getFeaturedProducts();

  return (
    <div className="bg-paper">

      {/* Hero */}
      <section className="bg-cream border-b border-cream-dark overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-0 min-h-[480px] items-stretch">

            {/* Texto */}
            <div className="py-20 lg:py-28 flex flex-col justify-center lg:pr-16">
              <p className="section-label mb-5">Blumenau, SC</p>
              <h1 className="font-display font-light text-ink leading-[1.08] text-[clamp(40px,5.5vw,68px)] mb-6">
                Lençóis com qualidade<br />
                <em>direto da fábrica</em>
              </h1>
              <p className="text-[15px] text-ink-light max-w-[400px] leading-relaxed mb-8">
                Entrega local em até 1h ou para todo o Brasil com rastreamento em tempo real.
              </p>
              <div className="flex gap-3 flex-wrap">
                <Link href="/produtos" className="btn-primary">Ver coleção</Link>
                <Link href="/sobre" className="btn-outline">Nossa história</Link>
              </div>
            </div>

            {/* Decoração */}
            <div className="hidden lg:flex items-center justify-center border-l border-cream-dark">
              <div className="text-center px-16">
                <p className="font-display text-[80px] text-ink/8 leading-none select-none">M</p>
                <div className="w-px h-16 bg-cream-dark mx-auto my-4" />
                <p className="section-label">Est. Blumenau</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="border-b border-cream-dark">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-cream-dark">
            {[
              { label: 'Entrega local em 1h', desc: 'Para endereços em Blumenau via Uber Direct.' },
              { label: 'Frete para o Brasil', desc: 'PAC, SEDEX e transportadoras com rastreio.' },
              { label: 'Pagamento PIX', desc: 'QR Code na hora, confirmação automática.' },
            ].map((b) => (
              <div key={b.label} className="flex flex-col gap-1.5 px-8 py-8">
                <div className="w-5 h-px bg-warm-dark mb-2" />
                <p className="text-[13px] font-semibold text-ink">{b.label}</p>
                <p className="text-[13px] text-ink-light leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Produtos em destaque */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between border-b border-cream-dark pb-4 mb-10">
            <div>
              <p className="section-label mb-2">Coleção</p>
              <h2 className="font-display text-[34px] font-light text-ink">Produtos em destaque</h2>
            </div>
            <Link href="/produtos" className="text-[12px] font-medium tracking-[0.07em] text-ink-light no-underline hover:text-ink transition-colors hidden sm:block">
              Ver todos →
            </Link>
          </div>

          {products.length === 0 ? (
            <div className="py-20 text-center text-[14px] text-ink-light">
              Nenhum produto cadastrado ainda.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-cream-dark">
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}

          <div className="mt-8 text-center sm:hidden">
            <Link href="/produtos" className="btn-outline">Ver todos os produtos</Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink text-paper py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-warm mb-5">Qualidade garantida</p>
          <h2 className="font-display font-light text-[clamp(28px,4vw,48px)] text-paper mb-6 max-w-xl mx-auto leading-snug">
            Tecido que dura, conforto que fica
          </h2>
          <p className="text-[14px] text-cream/60 max-w-md mx-auto mb-8 leading-relaxed">
            Fios selecionados, acabamento cuidadoso e controle de qualidade em cada peça.
          </p>
          <Link href="/produtos" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 text-[13px] font-semibold tracking-[0.08em] bg-paper text-ink hover:bg-cream transition-colors">
            Comprar agora
          </Link>
        </div>
      </section>

    </div>
  );
}
