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
    if (!user) {
      router.push('/entrar');
      return;
    }

    const cartRef = doc(db, 'carts', user.uid);
    const unsub = onSnapshot(cartRef, (snap) => {
      setCart(snap.exists() ? (snap.data() as Cart) : null);
      setCartLoading(false);
    });

    return unsub;
  }, [user, loading, router]);

  async function removeItem(sku: string) {
    if (!user || !cart) return;
    const cartRef = doc(db, 'carts', user.uid);
    await updateDoc(cartRef, {
      items: cart.items.filter((i) => i.sku !== sku),
    });
  }

  async function updateQty(sku: string, qty: number) {
    if (!user || !cart) return;
    if (qty < 1) {
      await removeItem(sku);
      return;
    }
    const cartRef = doc(db, 'carts', user.uid);
    await updateDoc(cartRef, {
      items: cart.items.map((i) => (i.sku === sku ? { ...i, quantity: qty } : i)),
    });
  }

  if (loading || cartLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <p className="text-sm text-gray-400">Carregando…</p>
      </div>
    );
  }

  const items: CartItem[] = cart?.items ?? [];
  const totalCents = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-2xl font-semibold text-gray-900">Carrinho</h1>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24">
          <p className="text-gray-500">Seu carrinho está vazio.</p>
          <Link
            href="/produtos"
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Ver produtos
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Items */}
          <div className="lg:col-span-2">
            <ul className="divide-y divide-gray-200">
              {items.map((item) => (
                <li key={item.sku} className="flex gap-4 py-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-gray-100">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.productName}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <span className="text-xs text-gray-400">—</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-1">
                    <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                    <p className="text-xs text-gray-500">
                      {item.variant.size}
                      {item.variant.color ? ` · ${item.variant.color}` : ''}
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCurrency(item.unitPrice)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end justify-between">
                    <button
                      onClick={() => removeItem(item.sku)}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      Remover
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQty(item.sku, item.quantity - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm">{item.quantity}</span>
                      <button
                        onClick={() => updateQty(item.sku, item.quantity + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-gray-200 p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Resumo</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal ({items.length} iten{items.length !== 1 ? 's' : 's'})</span>
                <span>{formatCurrency(totalCents)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-400">
                <span>Frete</span>
                <span>calculado no checkout</span>
              </div>
            </div>
            <div className="my-4 border-t border-gray-200" />
            <div className="flex justify-between font-semibold text-gray-900">
              <span>Total</span>
              <span>{formatCurrency(totalCents)}</span>
            </div>
            <Link
              href="/checkout"
              className="mt-6 block w-full rounded-lg bg-blue-600 py-3 text-center text-sm font-medium text-white hover:bg-blue-700"
            >
              Finalizar compra
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
