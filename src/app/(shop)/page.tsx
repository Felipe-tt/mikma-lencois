import { adminDb } from '@/lib/firebase/admin';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getFeatured(): Promise<Product[]> {
  try {
    const snap = await adminDb.collection('products').where('active', '==', true)
      .orderBy('createdAt', 'desc').limit(8).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
  } catch { return []; }
}

export default async function HomePage() {
  const products = await getFeatured();

  return (
    <>
      {/* ── Hero ── */}
      <section className="bg-stone-900 text-stone-50 overflow-hidden">
        <div className="container-shop">
          <div className="grid lg:grid-cols-[1fr_480px] gap-0 min-h-[520px] items-center">

            {/* Texto */}
            <div className="py-20 lg:py-28 lg:pr-20">
              <span className="eyebrow text-gold-400 mb-6 block">Coleção atual</span>
              <h1 className="font-display font-light text-5xl sm:text-6xl text-stone-50 mb-6 leading-none">
                Durabilidade<br />
                <em className="text-gold-400">e conforto</em><br />
                real.
              </h1>
              <p className="text-base text-stone-400 max-w-sm mb-10 leading-relaxed">
                Produzido em Blumenau, SC. Entrega local em até 1h ou para todo o Brasil com rastreamento.
              </p>
              <div className="flex gap-3 flex-wrap">
                <Link href="/produtos" className="btn-primary-lg">
                  Ver coleção
                </Link>
                <Link href="/sobre" className="btn px-8 py-4 border-stone-700 text-stone-300 hover:bg-stone-800 hover:text-stone-50 text-base font-semibold tracking-wider uppercase">
                  Nossa história
                </Link>
              </div>
            </div>

            {/* Decorativo — seria substituído por imagem real */}
            <div className="hidden lg:flex items-center justify-center border-l border-stone-800 h-full">
              <div className="text-center">
                <p className="font-display text-[140px] text-stone-800 leading-none select-none">M</p>
                <p className="eyebrow text-stone-600 mt-2">Mikma Lençóis</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Faixa de diferenciais ── */}
      <section className="bg-stone-100 border-y border-stone-200">
        <div className="container-shop">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-stone-200">
            {[
              { title: 'Entrega em 1h', sub: 'Para endereços em Blumenau via Uber Direct' },
              { title: 'Frete para o Brasil', sub: 'PAC, SEDEX e transportadoras com rastreio' },
              { title: 'Pague com PIX', sub: 'Confirmação automática e instantânea' },
            ].map(b => (
              <div key={b.title} className="px-8 py-8">
                <div className="w-6 h-0.5 bg-gold-500 mb-4" />
                <p className="text-sm font-semibold text-stone-900 mb-1">{b.title}</p>
                <p className="text-sm text-stone-500">{b.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Produtos em destaque ── */}
      <section className="py-16">
        <div className="container-shop">
          <div className="flex items-end justify-between mb-10">
            <div>
              <span className="eyebrow mb-2 block">Destaques</span>
              <h2 className="font-display text-4xl text-stone-900 font-light">Produtos</h2>
            </div>
            <Link href="/produtos" className="text-sm text-stone-500 hover:text-stone-900 transition-colors hidden sm:block">
              Ver todos →
            </Link>
          </div>

          {products.length === 0 ? (
            <p className="py-20 text-center text-sm text-stone-400">Nenhum produto cadastrado ainda.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-stone-200">
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}

          <div className="mt-8 text-center sm:hidden">
            <Link href="/produtos" className="btn-outline">Ver todos os produtos</Link>
          </div>
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section className="bg-stone-100 border-t border-stone-200 py-20">
        <div className="container-shop flex flex-col sm:flex-row items-center justify-between gap-8">
          <div>
            <span className="eyebrow mb-3 block">Qualidade garantida</span>
            <h2 className="font-display text-4xl font-light text-stone-900 max-w-md leading-tight">
              Tecido que dura, conforto que fica
            </h2>
          </div>
          <Link href="/produtos" className="btn-primary shrink-0">
            Comprar agora
          </Link>
        </div>
      </section>
    </>
  );
}
