'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Product, InventoryItem, ProductVariant } from '@/types';

interface Props {
  product: Product;
  inventory: InventoryItem[];
}

export function VariantSelector({ product, inventory }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants[0]?.id ?? null
  );
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);

  function getStockForVariant(variant: ProductVariant): number {
    const sku = `${product.id}_${variant.id}`;
    const inv = inventory.find((i) => i.sku === sku);
    if (!inv) return 0;
    return Math.max(0, inv.quantity - inv.reserved);
  }

  const availableStock = selectedVariant ? getStockForVariant(selectedVariant) : 0;
  const outOfStock = availableStock === 0;

  async function addToCart() {
    if (loading) return;
    if (!user) {
      router.push('/entrar');
      return;
    }
    if (!selectedVariant || outOfStock) return;

    setAdding(true);
    try {
      const sku = `${product.id}_${selectedVariant.id}`;
      const cartRef = doc(db, 'carts', user.uid);

      const cartItem = {
        productId: product.id,
        productName: product.name,
        sku,
        variant: selectedVariant,
        quantity: qty,
        unitPrice: product.price,
        image: product.images[0] ?? '',
      };

      await setDoc(
        cartRef,
        {
          userId: user.uid,
          items: arrayUnion(cartItem),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      router.push('/carrinho');
    } catch (err) {
      console.error('addToCart error:', err);
    } finally {
      setAdding(false);
    }
  }

  if (product.variants.length === 0) {
    return <p className="text-sm text-gray-500">Nenhuma variação cadastrada para este produto.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">Tamanho / Variação</p>
        <div className="flex flex-wrap gap-2">
          {product.variants.map((variant) => {
            const stock = getStockForVariant(variant);
            const isSelected = variant.id === selectedVariantId;
            const unavailable = stock === 0;
            return (
              <button
                key={variant.id}
                onClick={() => { if (!unavailable) { setSelectedVariantId(variant.id); setQty(1); } }}
                disabled={unavailable}
                className={[
                  'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                  isSelected ? 'border-blue-600 bg-blue-600 text-white'
                    : unavailable ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300 line-through'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400',
                ].join(' ')}
              >
                {variant.size}{variant.color ? ` — ${variant.color}` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {!outOfStock && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Quantidade</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50">−</button>
            <span className="w-6 text-center text-sm font-medium text-gray-900">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(availableStock, q + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50">+</button>
            <span className="text-xs text-gray-400">{availableStock} disponíveis</span>
          </div>
        </div>
      )}

      <button
        onClick={addToCart}
        disabled={outOfStock || adding || !selectedVariant || loading}
        className={[
          'w-full rounded-lg py-3 text-sm font-medium transition-colors',
          outOfStock || !selectedVariant ? 'cursor-not-allowed bg-gray-100 text-gray-400'
            : loading ? 'cursor-wait bg-gray-200 text-gray-400'
            : adding ? 'cursor-wait bg-blue-400 text-white'
            : 'bg-blue-600 text-white hover:bg-blue-700',
        ].join(' ')}
      >
        {outOfStock ? 'Sem estoque' : loading ? 'Carregando…' : adding ? 'Adicionando…' : 'Adicionar ao carrinho'}
      </button>
    </div>
  );
}
