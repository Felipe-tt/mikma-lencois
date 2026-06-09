'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrency } from '@/lib/utils/format';
import { useRouter } from 'next/navigation';
import type { Cart, CartItem } from '@/types';
import { CartSkeleton } from '@/components/ui/Skeleton';

export default function CartPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    return onSnapshot(doc(db, 'carts', user.uid), snap => {
      setCart(snap.exists() ? snap.data() as Cart : null);
      setCartLoading(false);
    });
  }, [user, loading, router]);

  async function removeItem(sku: string) {
    if (!user || !cart) return;
    await updateDoc(doc(db, 'carts', user.uid), { items: cart.items.filter(i => i.sku !== sku) });
  }
  async function updateQty(sku: string, qty: number) {
    if (!user || !cart) return;
    if (qty < 1) { await removeItem(sku); return; }
    await updateDoc(doc(db, 'carts', user.uid), { items: cart.items.map(i => i.sku === sku ? {...i, quantity: qty} : i) });
  }

  const items: CartItem[] = cart?.items ?? [];
  const total = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);

  return (
    <div>
      <div className="page-header">
        <div className="container-shop">
          <span className="eyebrow mb-3 block">Compra</span>
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl">Carrinho</h1>
        </div>
      </div>

      {loading || cartLoading ? (
        <CartSkeleton />
      ) : items.length === 0 ? (
        <div className="container-shop py-24 sm:py-32 flex flex-col items-center gap-5 text-center px-6">
          <div className="w-16 h-16 bg-warm flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-faint">
              <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
            </svg>
          </div>
          <p className="font-display text-2xl text-ink font-normal">Seu carrinho está vazio</p>
          <p className="text-sm text-mid">Explore nossos produtos e adicione itens ao carrinho.</p>
          <Link href="/produtos" className="btn-primary mt-2">Ver produtos</Link>
        </div>
      ) : (
        <div className="container-shop py-8 sm:py-12 pb-20">
          <div className="flex flex-col lg:grid lg:grid-cols-[1fr_360px] gap-8 lg:gap-12 items-start">
            {/* Items */}
            <div className="flex flex-col divide-y divide-mist">
              {items.map(item => (
                <div key={item.sku} className="flex gap-4 sm:gap-5 py-5 sm:py-6">
                  <div className="relative w-20 h-24 sm:w-24 sm:h-28 shrink-0 overflow-hidden bg-warm">
                    {item.image
                      ? <Image src={item.image} alt={item.productName} fill sizes="96px" className="object-cover" />
                      : <div className="flex h-full items-center justify-center bg-warm/50" />
                    }
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <p className="text-sm font-semibold text-ink leading-snug">{item.productName}</p>
                    <p className="text-xs text-faint">{item.variant?.size}{item.variant?.color ? ` · ${item.variant.color}` : ''}</p>
                    <p className="font-display text-lg sm:text-xl text-ink mt-1">{formatCurrency(item.unitPrice)}</p>
                  </div>
                  <div className="flex flex-col items-end justify-between shrink-0">
                    <button onClick={() => removeItem(item.sku)}
                      className="text-xs text-faint hover:text-red-500 transition-colors font-medium">
                      Remover
                    </button>
                    <div className="flex items-center border border-mist">
                      <button onClick={() => updateQty(item.sku, item.quantity-1)}
                        className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors text-lg font-light">
                        −
                      </button>
                      <span className="w-8 sm:w-9 text-center text-sm font-medium text-ink">{item.quantity}</span>
                      <button onClick={() => updateQty(item.sku, item.quantity+1)}
                        className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors text-lg font-light">
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="w-full bg-warm border border-mist p-5 sm:p-7 flex flex-col gap-5 lg:sticky lg:top-28">
              <h2 className="font-display font-normal text-ink text-xl">Resumo do pedido</h2>
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between text-mid">
                  <span>Subtotal ({items.length} iten{items.length!==1?'s':''})</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between text-faint text-xs">
                  <span>Frete</span>
                  <span>calculado no checkout</span>
                </div>
              </div>
              <div className="border-t border-mist pt-4 flex justify-between items-center">
                <span className="text-sm font-semibold text-ink">Total</span>
                <span className="font-display text-2xl text-ink">{formatCurrency(total)}</span>
              </div>
              <Link href="/checkout" className="btn-primary w-full py-4 text-sm font-semibold tracking-wide">
                Finalizar compra
              </Link>
              <Link href="/produtos" className="text-center text-xs text-faint hover:text-clay transition-colors font-medium">
                Continuar comprando
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
