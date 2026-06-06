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
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(product.variants[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);

  const selectedVariant = product.variants.find(v => v.id === selectedVariantId);

  function getStock(variant: ProductVariant): number {
    const sku = `${product.id}_${variant.id}`;
    const inv = inventory.find(i => i.sku === sku);
    if (!inv) return 0;
    return Math.max(0, inv.quantity - inv.reserved);
  }

  const availableStock = selectedVariant ? getStock(selectedVariant) : 0;
  const outOfStock = availableStock === 0;

  async function addToCart() {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    if (!selectedVariant || outOfStock) return;

    setAdding(true);
    try {
      const sku = `${product.id}_${selectedVariant.id}`;
      await setDoc(
        doc(db, 'carts', user.uid),
        {
          userId: user.uid,
          items: arrayUnion({
            productId: product.id,
            productName: product.name,
            sku,
            variant: selectedVariant,
            quantity: qty,
            unitPrice: product.price,
            image: product.images[0] ?? '',
          }),
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
    return <p className="text-sm text-faint">Nenhuma variação cadastrada para este produto.</p>;
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Variant selector */}
      <div>
        <p className="label mb-3">Tamanho / Variação</p>
        <div className="flex flex-wrap gap-2">
          {product.variants.map(variant => {
            const stock = getStock(variant);
            const isSelected = variant.id === selectedVariantId;
            const unavailable = stock === 0;

            return (
              <button
                key={variant.id}
                onClick={() => { if (!unavailable) { setSelectedVariantId(variant.id); setQty(1); } }}
                disabled={unavailable}
                className={[
                  'border px-4 py-2 text-sm font-medium transition-all duration-200',
                  isSelected
                    ? 'border-ink bg-ink text-paper'
                    : unavailable
                    ? 'cursor-not-allowed border-mist bg-warm text-faint line-through'
                    : 'border-mist text-mid hover:border-ink hover:text-ink',
                ].join(' ')}
              >
                {variant.size}{variant.color ? ` — ${variant.color}` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quantity */}
      {!outOfStock && (
        <div>
          <p className="label mb-3">Quantidade</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center border border-mist">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-10 h-10 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors text-xl font-light"
              >
                −
              </button>
              <span className="w-10 text-center text-sm font-medium text-ink">{qty}</span>
              <button
                onClick={() => setQty(q => Math.min(availableStock, q + 1))}
                className="w-10 h-10 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors text-xl font-light"
              >
                +
              </button>
            </div>
            <span className="text-xs text-faint">{availableStock} disponíve{availableStock !== 1 ? 'is' : 'l'}</span>
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={addToCart}
        disabled={outOfStock || adding || !selectedVariant || loading}
        className={[
          'w-full py-4 text-sm font-semibold tracking-wide transition-all duration-200 border',
          outOfStock || !selectedVariant
            ? 'cursor-not-allowed bg-warm text-faint border-mist'
            : loading
            ? 'cursor-wait bg-warm text-faint border-mist'
            : adding
            ? 'cursor-wait bg-clay/80 text-paper border-clay/80'
            : 'btn-primary',
        ].join(' ')}
      >
        {outOfStock
          ? 'Sem estoque'
          : loading
          ? 'Carregando…'
          : adding
          ? <span className="flex items-center justify-center gap-2"><span className="spinner" /> Adicionando…</span>
          : 'Adicionar ao carrinho'}
      </button>
    </div>
  );
}
