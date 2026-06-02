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
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Product));
  } catch { return []; }
}

export default async function HomePage() {
  const products = await getFeaturedProducts();

  return (
    <div style={{ background: 'var(--white)' }}>

      {/* Hero */}
      <section style={{ background: 'var(--cream)', borderBottom: '1px solid var(--cream-d)', overflow: 'hidden', position: 'relative' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" style={{ paddingTop: 80, paddingBottom: 80 }}>
          <p className="section-label" style={{ marginBottom: 20 }}>Blumenau, SC</p>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(42px, 6vw, 72px)', fontWeight: 300, color: 'var(--ink)', lineHeight: 1.1, maxWidth: 660, marginBottom: 20 }}>
            Lençóis com qualidade<br />
            <em>direto da fábrica</em>
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ink-l)', maxWidth: 440, lineHeight: 1.7, marginBottom: 36 }}>
            Entrega local em até 1h ou para todo o Brasil com rastreamento em tempo real.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/produtos" className="btn-primary">Ver coleção</Link>
            <Link href="/sobre" className="btn-outline">Nossa história</Link>
          </div>
        </div>
        {/* Decorative line */}
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, background: 'var(--cream-d)' }} />
      </section>

      {/* Benefits */}
      <section style={{ borderBottom: '1px solid var(--cream-d)' }}>
        <div className="mx-auto max-w-7xl" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {[
            { icon: '◎', title: 'Entrega local em 1h', desc: 'Para endereços em Blumenau via Uber Direct.' },
            { icon: '◎', title: 'Frete para o Brasil', desc: 'PAC, SEDEX e transportadoras com rastreio.' },
            { icon: '◎', title: 'Pagamento PIX', desc: 'QR Code na hora, confirmação automática.' },
          ].map((b, i) => (
            <div key={i} style={{
              padding: '32px 32px',
              borderRight: i < 2 ? '1px solid var(--cream-d)' : 'none',
              display: 'flex', flexDirection: 'column', gap: 6
            }}>
              <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, color: 'var(--warm-d)' }}>{b.icon}</span>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}>{b.title}</p>
              <p style={{ fontSize: 13, color: 'var(--ink-l)', lineHeight: 1.6 }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section style={{ padding: '64px 0' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 40, borderBottom: '1px solid var(--cream-d)', paddingBottom: 16 }}>
            <div>
              <p className="section-label" style={{ marginBottom: 6 }}>Coleção</p>
              <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 34, fontWeight: 400, color: 'var(--ink)' }}>
                Produtos em destaque
              </h2>
            </div>
            <Link href="/produtos" style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--ink-l)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
              className="hover:text-ink transition-colors">
              Ver todos →
            </Link>
          </div>

          {products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--ink-l)', fontSize: 14 }}>
              Nenhum produto cadastrado ainda.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1, background: 'var(--cream-d)' }}>
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
