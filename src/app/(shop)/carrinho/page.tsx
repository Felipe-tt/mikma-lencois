'use client';
import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrency } from '@/lib/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Cart, CartItem } from '@/types';

export default function CartPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    const unsub = onSnapshot(doc(db, 'carts', user.uid), (snap) => {
      setCart(snap.exists() ? (snap.data() as Cart) : null);
      setCartLoading(false);
    });
    return unsub;
  }, [user, loading, router]);

  async function removeItem(sku: string) {
    if (!user || !cart) return;
    await updateDoc(doc(db, 'carts', user.uid), { items: cart.items.filter(i => i.sku !== sku) });
  }

  async function updateQty(sku: string, qty: number) {
    if (!user || !cart) return;
    if (qty < 1) { await removeItem(sku); return; }
    await updateDoc(doc(db, 'carts', user.uid), {
      items: cart.items.map(i => i.sku === sku ? { ...i, quantity: qty } : i),
    });
  }

  if (loading || cartLoading) {
    return <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-l)' }}>Carregando…</p>
    </div>;
  }

  const items: CartItem[] = cart?.items ?? [];
  const totalCents = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  return (
    <div style={{ background: 'var(--white)', minHeight: '60vh' }}>
      <div style={{ borderBottom: '1px solid var(--cream-d)', background: 'var(--cream)', padding: '36px 0' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="section-label" style={{ marginBottom: 6 }}>Compra</p>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 34, fontWeight: 300, color: 'var(--ink)' }}>
            Carrinho
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" style={{ paddingTop: 40, paddingBottom: 80 }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, color: 'var(--ink-l)', fontWeight: 300 }}>Seu carrinho está vazio</p>
            <Link href="/produtos" className="btn-primary" style={{ marginTop: 8 }}>Ver produtos</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 48, alignItems: 'start' }}>
            {/* Items */}
            <div>
              {items.map((item, idx) => (
                <div key={item.sku} style={{
                  display: 'flex', gap: 20, padding: '24px 0',
                  borderBottom: idx < items.length - 1 ? '1px solid var(--cream-d)' : 'none'
                }}>
                  <div style={{ position: 'relative', width: 88, height: 110, flexShrink: 0, background: 'var(--mist)', overflow: 'hidden' }}>
                    {item.image ? (
                      <Image src={item.image} alt={item.productName} fill sizes="88px" style={{ objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--ink-l)' }}>—</span>
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{item.productName}</p>
                    <p style={{ fontSize: 12, color: 'var(--ink-l)', letterSpacing: '0.04em' }}>
                      {item.variant.size}{item.variant.color ? ` · ${item.variant.color}` : ''}
                    </p>
                    <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, color: 'var(--ink)', marginTop: 4 }}>
                      {formatCurrency(item.unitPrice)}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <button onClick={() => removeItem(item.sku)}
                      style={{ fontSize: 11, color: 'var(--ink-l)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.06em' }}
                      className="hover:text-red-500 transition-colors">
                      Remover
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid var(--cream-d)' }}>
                      <button onClick={() => updateQty(item.sku, item.quantity - 1)}
                        style={{ width: 32, height: 32, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-m)' }}>
                        −
                      </button>
                      <span style={{ width: 32, textAlign: 'center', fontSize: 13, color: 'var(--ink)' }}>{item.quantity}</span>
                      <button onClick={() => updateQty(item.sku, item.quantity + 1)}
                        style={{ width: 32, height: 32, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-m)' }}>
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div style={{ position: 'sticky', top: 100, border: '1px solid var(--cream-d)', padding: '28px 24px', background: 'var(--cream)' }}>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: 'var(--ink)', marginBottom: 20, fontWeight: 400 }}>Resumo do pedido</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-m)' }}>
                  <span>Subtotal ({items.length} iten{items.length !== 1 ? 's' : ''})</span>
                  <span>{formatCurrency(totalCents)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-l)' }}>
                  <span>Frete</span>
                  <span>calculado no checkout</span>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--cream-d)', paddingTop: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Total</span>
                <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: 'var(--ink)' }}>{formatCurrency(totalCents)}</span>
              </div>
              <Link href="/checkout" className="btn-primary" style={{ width: '100%', justifyContent: 'center', display: 'flex' }}>
                Finalizar compra
              </Link>
              <Link href="/produtos" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 12, color: 'var(--ink-l)', textDecoration: 'none' }}
                className="hover:text-ink transition-colors">
                ← Continuar comprando
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
