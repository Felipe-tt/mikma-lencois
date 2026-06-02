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
    const unsub = onSnapshot(doc(db, 'carts', user.uid), snap => {
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
    return (
      <div className="min-h-[320px] flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  const items: CartItem[] = cart?.items ?? [];
  const total = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  return (
    <div className="bg-paper min-h-[60vh]">
      {/* Header */}
      <div className="border-b border-cream-dark bg-cream py-9">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="section-label mb-2">Compra</p>
          <h1 className="font-display font-light text-[34px] text-ink">Carrinho</h1>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 pb-20">
        {items.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-5 text-center">
            <p className="font-display text-[22px] font-light text-ink-light">Seu carrinho está vazio</p>
            <Link href="/produtos" className="btn-primary mt-2">Ver produtos</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12 items-start">
            {/* Itens */}
            <div className="flex flex-col divide-y divide-cream-dark">
              {items.map(item => (
                <div key={item.sku} className="flex gap-5 py-6">
                  <div className="relative w-20 h-24 shrink-0 bg-mist overflow-hidden">
                    {item.image ? (
                      <Image src={item.image} alt={item.productName} fill sizes="80px" className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <span className="text-[11px] text-ink-light">—</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col gap-1">
                    <p className="text-[14px] font-medium text-ink">{item.productName}</p>
                    <p className="text-[12px] text-ink-light tracking-[0.04em]">
                      {item.variant.size}{item.variant.color ? ` · ${item.variant.color}` : ''}
                    </p>
                    <p className="font-display text-[18px] text-ink mt-1">{formatCurrency(item.unitPrice)}</p>
                  </div>

                  <div className="flex flex-col items-end justify-between">
                    <button
                      onClick={() => removeItem(item.sku)}
                      className="text-[11px] text-ink-light bg-transparent border-none tracking-[0.06em] hover:text-red-600 transition-colors"
                    >
                      Remover
                    </button>
                    <div className="flex items-center border border-cream-dark">
                      <button onClick={() => updateQty(item.sku, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center text-[16px] text-ink-mid bg-transparent border-none hover:bg-cream transition-colors">−</button>
                      <span className="w-8 text-center text-[13px] text-ink">{item.quantity}</span>
                      <button onClick={() => updateQty(item.sku, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center text-[16px] text-ink-mid bg-transparent border-none hover:bg-cream transition-colors">+</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Resumo */}
            <div className="summary-card">
              <p className="font-display text-[20px] text-ink mb-5">Resumo do pedido</p>
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex justify-between text-[13px] text-ink-mid">
                  <span>Subtotal ({items.length} {items.length !== 1 ? 'itens' : 'item'})</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between text-[12px] text-ink-light">
                  <span>Frete</span>
                  <span>calculado no checkout</span>
                </div>
              </div>
              <div className="border-t border-cream-dark pt-4 mb-6 flex justify-between items-baseline">
                <span className="text-[14px] font-semibold text-ink">Total</span>
                <span className="font-display text-[22px] text-ink">{formatCurrency(total)}</span>
              </div>
              <Link href="/checkout" className="btn-primary w-full justify-center">
                Finalizar compra
              </Link>
              <Link href="/produtos" className="block text-center mt-3 text-[12px] text-ink-light no-underline hover:text-ink transition-colors">
                ← Continuar comprando
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
