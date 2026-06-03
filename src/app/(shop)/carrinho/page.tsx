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
    return onSnapshot(doc(db, 'carts', user.uid), snap => {
      setCart(snap.exists() ? (snap.data() as Cart) : null);
      setCartLoading(false);
    });
  }, [user, loading, router]);

  async function remove(sku: string) {
    if (!user || !cart) return;
    await updateDoc(doc(db, 'carts', user.uid), { items: cart.items.filter(i => i.sku !== sku) });
  }

  async function setQty(sku: string, qty: number) {
    if (!user || !cart) return;
    if (qty < 1) { await remove(sku); return; }
    await updateDoc(doc(db, 'carts', user.uid), {
      items: cart.items.map(i => i.sku === sku ? { ...i, quantity: qty } : i),
    });
  }

  if (loading || cartLoading) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="spinner" /></div>;
  }

  const items: CartItem[] = cart?.items ?? [];
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <div>
      <div className="page-hero">
        <div className="container-shop">
          <span className="eyebrow mb-2 block">Compra</span>
          <h1 className="font-display text-4xl font-light text-stone-900">Carrinho</h1>
        </div>
      </div>

      <div className="container-shop py-10 pb-20 min-h-[50vh]">
        {items.length === 0 ? (
          <div className="py-28 flex flex-col items-center gap-6 text-center">
            <CartEmptyIcon />
            <div>
              <p className="font-display text-2xl font-light text-stone-400 mb-1">Carrinho vazio</p>
              <p className="text-sm text-stone-400">Adicione produtos para continuar</p>
            </div>
            <Link href="/produtos" className="btn-primary mt-2">Ver produtos</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-12 items-start">

            {/* Lista de itens */}
            <div>
              <div className="hidden sm:grid grid-cols-[1fr_120px_100px_80px] gap-4 pb-3 border-b border-stone-200 mb-0">
                {['Produto', 'Qtd.', 'Preço', ''].map(h => (
                  <span key={h} className="text-2xs font-semibold tracking-widest uppercase text-stone-400">{h}</span>
                ))}
              </div>

              <ul className="flex flex-col divide-y divide-stone-200">
                {items.map(item => (
                  <li key={item.sku} className="py-6 flex gap-4 items-start">
                    {/* Imagem */}
                    <div className="relative w-20 h-24 shrink-0 bg-stone-200 overflow-hidden">
                      {item.image
                        ? <Image src={item.image} alt={item.productName} fill sizes="80px" className="object-cover" />
                        : <div className="flex h-full items-center justify-center"><span className="font-display text-2xl text-stone-300">M</span></div>
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-900 leading-snug">{item.productName}</p>
                      <p className="text-xs text-stone-400 uppercase tracking-wider">
                        {item.variant?.size}{item.variant?.color ? ` · ${item.variant.color}` : ''}
                      </p>
                      <p className="font-display text-xl text-stone-900 mt-1">{formatCurrency(item.unitPrice)}</p>
                    </div>

                    {/* Qty + remove */}
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <button
                        onClick={() => remove(item.sku)}
                        className="text-2xs font-medium tracking-widest uppercase text-stone-400 hover:text-red-600 transition-colors"
                      >
                        Remover
                      </button>
                      <div className="flex items-center border border-stone-300">
                        <button onClick={() => setQty(item.sku, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center text-stone-600 hover:bg-stone-100 transition-colors text-lg leading-none">−</button>
                        <span className="w-8 text-center text-sm font-medium text-stone-900">{item.quantity}</span>
                        <button onClick={() => setQty(item.sku, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center text-stone-600 hover:bg-stone-100 transition-colors text-lg leading-none">+</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="pt-6">
                <Link href="/produtos" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">
                  ← Continuar comprando
                </Link>
              </div>
            </div>

            {/* Resumo */}
            <div className="order-summary flex flex-col gap-4">
              <h2 className="font-display text-2xl font-light text-stone-900">Resumo</h2>

              <ul className="flex flex-col gap-2 text-sm">
                {items.map(item => (
                  <li key={item.sku} className="flex justify-between gap-3 text-stone-600">
                    <span className="truncate">{item.productName} × {item.quantity}</span>
                    <span className="shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
              </ul>

              <div className="divider" />

              <div className="flex justify-between text-sm text-stone-500">
                <span>Frete</span>
                <span>calculado no checkout</span>
              </div>

              <div className="flex justify-between items-baseline">
                <span className="text-sm font-semibold text-stone-900">Total</span>
                <span className="font-display text-2xl text-stone-900">{formatCurrency(subtotal)}</span>
              </div>

              <Link href="/checkout" className="btn-primary-lg w-full mt-2">
                Finalizar compra
              </Link>

              <p className="text-xs text-stone-400 text-center">Pagamento seguro via PIX</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CartEmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300">
      <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
    </svg>
  );
}
