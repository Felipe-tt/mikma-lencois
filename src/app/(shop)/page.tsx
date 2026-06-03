import { adminDb } from '@/lib/firebase/admin';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getFeatured(): Promise<Product[]> {
  try {
    const snap = await adminDb.collection('products').where('active','==',true).orderBy('createdAt','desc').limit(8).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
  } catch { return []; }
}

export default async function HomePage() {
  const products = await getFeatured();

  return (
    <>
      {/* ── Hero ── */}
      <section className="bg-warm overflow-hidden">
        <div className="container-shop">
          <div className="grid lg:grid-cols-2 min-h-[580px]">

            {/* Left text */}
            <div className="flex flex-col justify-center py-20 lg:py-28 lg:pr-16">
              <span className="eyebrow mb-5">Blumenau, SC — Coleção {new Date().getFullYear()}</span>
              <h1 className="font-display font-normal text-ink leading-[1.08]" style={{fontSize:'clamp(3rem,7vw,5.5rem)'}}>
                Lençóis<br/>
                <em className="text-clay">feitos pra<br/>durar.</em>
              </h1>
              <p className="mt-7 text-base text-mid max-w-xs leading-relaxed">
                Qualidade direto da fábrica. Entrega em até 1h em Blumenau ou para todo o Brasil.
              </p>
              <div className="mt-10 flex items-center gap-4 flex-wrap">
                <Link href="/produtos" className="btn-primary-lg">Ver produtos</Link>
                <Link href="/sobre" className="text-sm font-medium text-mid hover:text-clay transition-colors inline-flex items-center gap-2">
                  Nossa história
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>
            </div>

            {/* Right — visual elegante */}
            <div className="hidden lg:flex items-center justify-center border-l border-mist relative overflow-hidden bg-warm">
              {/* Grid pattern de fundo tipo tecido */}
              <div className="absolute inset-0" style={{
                backgroundImage: `
                  linear-gradient(rgba(28,28,26,0.04) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(28,28,26,0.04) 1px, transparent 1px)
                `,
                backgroundSize: '32px 32px'
              }}/>
              {/* Círculo decorativo */}
              <div className="absolute w-80 h-80 rounded-full border border-clay/15" style={{top:'50%',left:'50%',transform:'translate(-50%,-50%)'}}/>
              <div className="absolute w-96 h-96 rounded-full border border-clay/08" style={{top:'50%',left:'50%',transform:'translate(-50%,-50%)'}}/>

              {/* Logo central */}
              <div className="relative flex flex-col items-center gap-6 z-10">
                {/* M estilizado em SVG inline */}
                <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <text x="50%" y="85%" dominantBaseline="auto" textAnchor="middle"
                        fontFamily="Georgia, 'Playfair Display', serif"
                        fontSize="110" fontWeight="400"
                        fill="#1C1C1A" opacity="1">M</text>
                </svg>
                <div className="text-center">
                  <p className="eyebrow text-ink/40 tracking-[0.3em] text-xs">MIKMA LENÇÓIS</p>
                  <div className="mt-2 w-8 h-px bg-clay mx-auto"/>
                  <p className="mt-2 text-xs text-mid/60 tracking-wider">BLUMENAU · SC</p>
                </div>
              </div>

              {/* Tags flutuantes de produto */}
              <div className="absolute top-16 right-12 bg-white/80 backdrop-blur-sm border border-mist px-4 py-2 shadow-sm">
                <p className="text-xs text-mid">400 fios</p>
                <p className="text-sm font-semibold text-ink">100% Algodão</p>
              </div>
              <div className="absolute bottom-20 left-10 bg-white/80 backdrop-blur-sm border border-mist px-4 py-2 shadow-sm">
                <p className="text-xs text-mid">Entrega</p>
                <p className="text-sm font-semibold text-ink">Em 1h · Blumenau</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Diferenciais ── */}
      <section className="border-y border-mist bg-paper">
        <div className="container-shop">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-mist">
            {[
              { n:'01', title:'Entrega em 1h', sub:'Para endereços em Blumenau via Uber Direct.' },
              { n:'02', title:'Frete nacional', sub:'PAC, SEDEX e transportadoras com rastreio em tempo real.' },
              { n:'03', title:'Pague com PIX', sub:'Confirmação automática e instantânea.' },
            ].map(b => (
              <div key={b.n} className="px-8 py-8 flex gap-5 items-start">
                <span className="font-display text-3xl text-clay/30 leading-none font-normal shrink-0 mt-0.5">{b.n}</span>
                <div>
                  <p className="text-sm font-semibold text-ink mb-1">{b.title}</p>
                  <p className="text-sm text-mid leading-relaxed">{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Produtos ── */}
      <section className="py-20">
        <div className="container-shop">
          <div className="flex items-end justify-between mb-12">
            <div>
              <span className="eyebrow mb-3 block">Destaques</span>
              <h2 className="font-display font-normal text-ink" style={{fontSize:'clamp(2rem,4vw,3rem)'}}>Produtos em destaque</h2>
            </div>
            <Link href="/produtos" className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-mid hover:text-clay transition-colors">
              Ver todos
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </div>

          {products.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-display text-2xl text-faint font-normal">Nenhum produto ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-mist">
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}

          <div className="mt-8 sm:hidden text-center">
            <Link href="/produtos" className="btn-outline">Ver todos os produtos</Link>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-ink py-20">
        <div className="container-shop">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
            <div>
              <span className="eyebrow text-clay mb-3 block">Qualidade real</span>
              <h2 className="font-display font-normal text-paper leading-tight" style={{fontSize:'clamp(2rem,4vw,3.5rem)'}}>
                Tecido que dura,<br/>
                <em className="text-clay">conforto que fica.</em>
              </h2>
            </div>
            <div className="shrink-0">
              <Link href="/produtos" className="btn-clay text-sm font-semibold px-8 py-4 tracking-wide">
                Comprar agora
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
