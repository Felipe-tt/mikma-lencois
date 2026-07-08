'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrency } from '@/lib/utils/format';
import type { Product, InventoryItem, ProductVariant, CartItem } from '@/types';

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
  const [addedOpen, setAddedOpen] = useState(false);

  const selectedVariant = product.variants.find(v => v.id === selectedVariantId);

  function getStock(variant: ProductVariant): number {
    const sku = `${product.id}_${variant.id}`;
    const inv = inventory.find(i => i.sku === sku);
    if (!inv) return 0;
    return Math.max(0, inv.quantity - inv.reserved);
  }

  const availableStock = selectedVariant ? getStock(selectedVariant) : 0;
  const outOfStock = availableStock === 0;

  const closeAdded = useCallback(() => setAddedOpen(false), []);

  useEffect(() => {
    if (!addedOpen) return;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAdded(); };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
  }, [addedOpen, closeAdded]);

  async function addToCart() {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    if (!selectedVariant || outOfStock) return;

    setAdding(true);
    try {
      const sku = `${product.id}_${selectedVariant.id}`;
      const cartRef = doc(db, 'carts', user.uid);

      // Lê carrinho atual para mesclar quantidade em vez de duplicar o item
      const cartSnap = await getDoc(cartRef);
      const existingItems: CartItem[] = cartSnap.exists()
        ? (cartSnap.data().items ?? [])
        : [];

      const existing = existingItems.find(i => i.sku === sku);
      const newQty = Math.min(availableStock, (existing?.quantity ?? 0) + qty);

      const newItem: CartItem = {
        productId: product.id,
        productName: product.name,
        sku,
        variant: selectedVariant,
        quantity: newQty,
        unitPrice: product.price,
        image: product.images[0] ?? '',
      };

      const updatedItems = existing
        ? existingItems.map(i => i.sku === sku ? newItem : i)
        : [...existingItems, newItem];

      await setDoc(cartRef, {
        userId: user.uid,
        items: updatedItems,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setAddedOpen(true);
    } catch (err) {
      console.error('addToCart error:', err);
    } finally {
      setAdding(false);
    }
  }

  if (product.variants.length === 0) {
    return <p className="text-[13px] text-faint">Nenhuma variação cadastrada para este produto.</p>;
  }

  return (
    <>
    <div className="flex flex-col gap-6">

      {/* ── Variant selector ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="label">Tamanho / Variação</p>
          {selectedVariant && (
            <span className="text-[11px] text-faint font-medium">
              {availableStock > 0 && availableStock <= 5 ? `Só ${availableStock} disponíve${availableStock !== 1 ? 'is' : 'l'}` : ''}
            </span>
          )}
        </div>
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
                title={unavailable ? 'Fora de estoque' : undefined}
                className={[
                  'relative border px-4 py-2.5 text-[13px] font-medium transition-all duration-150',
                  isSelected
                    ? 'border-ink bg-ink text-paper'
                    : unavailable
                    ? 'cursor-not-allowed border-mist text-faint'
                    : 'border-mist text-mid hover:border-ink/50 hover:text-ink',
                ].join(' ')}
              >
                {/* Diagonal strike for out-of-stock — more refined than text line-through */}
                {unavailable && (
                  <span className="absolute inset-0 pointer-events-none overflow-hidden">
                    <span className="absolute top-[calc(50%-0.5px)] left-0 w-[141%] h-px bg-mist origin-left rotate-[-27deg] translate-x-[-10%]" />
                  </span>
                )}
                {variant.size}{variant.color ? ` · ${variant.color}` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Quantity ── */}
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
              <span className="w-10 text-center text-[13px] font-semibold text-ink tabular-nums">{qty}</span>
              <button
                onClick={() => setQty(q => Math.min(availableStock, q + 1))}
                className="w-10 h-10 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors text-xl font-light"
              >
                +
              </button>
            </div>
            {availableStock <= 5 && availableStock > 0 && (
              <span className="text-[11px] text-amber-600 font-semibold">
                Apenas {availableStock} {availableStock === 1 ? 'unidade' : 'unidades'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── CTA — desktop; no mobile a barra fixa abaixo já cobre isso ── */}
      <button
        onClick={addToCart}
        disabled={outOfStock || adding || !selectedVariant || loading}
        className={[
          'hidden sm:flex w-full h-14 text-[13px] font-semibold tracking-[0.06em] border transition-all duration-150 items-center justify-center gap-2',
          outOfStock || !selectedVariant
            ? 'cursor-not-allowed bg-warm text-faint border-mist'
            : loading
            ? 'cursor-wait bg-warm text-faint border-mist'
            : adding
            ? 'cursor-wait bg-clay/80 text-paper border-clay/80'
            : 'bg-ink text-paper border-ink hover:bg-clay hover:border-clay active:scale-[0.98]',
        ].join(' ')}
      >
        {outOfStock
          ? 'Fora de estoque'
          : loading
          ? 'Carregando…'
          : adding
          ? <><span className="spinner" />Adicionando ao carrinho…</>
          : 'Adicionar ao carrinho'
        }
      </button>

      {/* Micro trust below CTA */}
      {!outOfStock && (
        <p className="text-[11px] text-faint text-center flex items-center justify-center gap-4">
          <span className="inline-flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Frete com rastreio
          </span>
          <span className="inline-flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            PIX confirmado na hora
          </span>
        </p>
      )}
    </div>

      {/* ── Barra fixa mobile — preço + CTA sempre à mão ao rolar a página ── */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-[70] bg-paper border-t border-mist px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-3">
        <div className="flex flex-col leading-tight shrink-0">
          <span className="text-[10px] text-faint">{qty > 1 ? `${qty} un.` : 'Preço'}</span>
          <span className="font-display text-[1.3rem] text-ink">{formatCurrency(product.price * qty)}</span>
        </div>
        <button
          onClick={addToCart}
          disabled={outOfStock || adding || !selectedVariant || loading}
          className={[
            'flex-1 h-12 text-[12px] font-semibold tracking-[0.05em] border transition-all duration-150 flex items-center justify-center gap-2',
            outOfStock || !selectedVariant
              ? 'cursor-not-allowed bg-warm text-faint border-mist'
              : loading
              ? 'cursor-wait bg-warm text-faint border-mist'
              : adding
              ? 'cursor-wait bg-clay/80 text-paper border-clay/80'
              : 'bg-ink text-paper border-ink active:bg-clay active:border-clay',
          ].join(' ')}
        >
          {outOfStock
            ? 'Fora de estoque'
            : adding
            ? <span className="spinner" />
            : 'Adicionar ao carrinho'
          }
        </button>
      </div>

      {/* ── Modal: item adicionado — continuar comprando ou ir pro carrinho ── */}
      {addedOpen && createPortal(
        <div
          className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center animate-fadeIn"
          onClick={closeAdded}
        >
          <div
            className="w-full sm:max-w-sm bg-paper sm:mx-4 sm:rounded-sm overflow-hidden shadow-modal animate-scaleIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-7 pb-6 text-center">
              <div className="mx-auto mb-4 w-11 h-11 rounded-full bg-clay/10 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-clay">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h3 className="font-display font-normal text-ink text-xl leading-none mb-1">Adicionado ao carrinho</h3>
              <p className="text-[13px] text-faint">{qty} {qty > 1 ? 'unidades' : 'unidade'} de {product.name}{selectedVariant ? ` · ${selectedVariant.size}${selectedVariant.color ? ` · ${selectedVariant.color}` : ''}` : ''}</p>
            </div>

            <div className="flex flex-col gap-2 px-6 pb-6">
              <button
                onClick={() => router.push('/carrinho')}
                className="w-full h-12 text-[13px] font-semibold tracking-[0.06em] bg-ink text-paper border border-ink hover:bg-clay hover:border-clay transition-colors duration-150"
              >
                Ver carrinho
              </button>
              <button
                onClick={closeAdded}
                className="w-full h-12 text-[13px] font-semibold tracking-[0.06em] text-mid border border-mist hover:border-ink/50 hover:text-ink transition-colors duration-150"
              >
                Continuar comprando
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
}
