'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
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
  pixDiscountThresholdCents: number;
  pixDiscountPct: number;
}

interface ShipOption {
  carrier: string;
  label: string;
  priceCents: number;
  estimatedDays: number;
  tag?: 'local' | 'economico' | 'rapido';
}

export function BuyBox({ product, inventory, pixDiscountThresholdCents, pixDiscountPct }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(product.variants[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [addedOpen, setAddedOpen] = useState(false);

  // ── Frete estimado ──
  const [cep, setCep] = useState('');
  const [shipLoading, setShipLoading] = useState(false);
  const [shipOptions, setShipOptions] = useState<ShipOption[] | null>(null);
  const [shipError, setShipError] = useState<string | null>(null);

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

  // ── Preço, parcelamento e PIX — mesma lógica do checkout, uma única fonte de verdade visual ──
  const lineTotal = product.price * qty;
  const maxInstall = Math.min(8, Math.max(1, Math.floor(lineTotal / 10000)));
  const installVal = Math.round(lineTotal / maxInstall);
  const pixEligible = pixDiscountThresholdCents > 0 && lineTotal >= pixDiscountThresholdCents;
  const pixDiscount = pixEligible ? Math.round(lineTotal * (pixDiscountPct / 100)) : 0;
  const pixTotal = lineTotal - pixDiscount;

  async function addItemToCart(finalQty: number): Promise<boolean> {
    if (!user || !selectedVariant) return false;
    const sku = `${product.id}_${selectedVariant.id}`;
    const cartRef = doc(db, 'carts', user.uid);
    const cartSnap = await getDoc(cartRef);
    const existingItems: CartItem[] = cartSnap.exists() ? (cartSnap.data().items ?? []) : [];
    const existing = existingItems.find(i => i.sku === sku);
    const newQty = Math.min(availableStock, (existing?.quantity ?? 0) + finalQty);

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

    await setDoc(cartRef, { userId: user.uid, items: updatedItems, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  }

  async function addToCart() {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    if (!selectedVariant || outOfStock) return;
    setAdding(true);
    try {
      await addItemToCart(qty);
      setAddedOpen(true);
    } catch (err) {
      console.error('addToCart error:', err);
    } finally {
      setAdding(false);
    }
  }

  async function buyNow() {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    if (!selectedVariant || outOfStock) return;
    setBuyingNow(true);
    try {
      await addItemToCart(qty);
      router.push('/checkout');
    } catch (err) {
      console.error('buyNow error:', err);
      setBuyingNow(false);
    }
  }

  async function calcShipping() {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) { setShipError('Digite um CEP válido'); return; }
    setShipLoading(true); setShipError(null); setShipOptions(null);
    try {
      const res = await fetch(`/api/products/${product.id}/shipping-estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destCep: clean, qty }),
      });
      const data = await res.json();
      if (!res.ok) { setShipError(data.error || 'Não foi possível calcular'); return; }
      setShipOptions(data.options ?? []);
    } catch {
      setShipError('Erro de conexão. Tente de novo.');
    } finally {
      setShipLoading(false);
    }
  }

  const cepMasked = useMemo(() => {
    const d = cep.replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  }, [cep]);

  if (product.variants.length === 0) {
    return <p className="text-[13px] text-faint">Nenhuma variação cadastrada para este produto.</p>;
  }

  return (
    <>
      {/* ── Buy box: cartão único, estilo Amazon/ML, com tudo que decide a compra ── */}
      <div className="border border-mist bg-paper p-5 sm:p-6 flex flex-col gap-5">

        {/* Preço */}
        <div>
          <p className="font-display text-[2rem] leading-none text-ink font-normal tracking-[-0.02em]">
            {formatCurrency(product.price)}
          </p>
          <p className="text-[12px] text-mid mt-1.5">
            em até <strong className="text-ink">{maxInstall}x de {formatCurrency(installVal)}</strong> sem juros
          </p>
          {pixDiscountThresholdCents > 0 && (
            <p className="text-[12px] text-mid mt-0.5">
              {pixEligible ? (
                <>ou <strong className="text-green-700">{formatCurrency(pixTotal)}</strong> à vista no PIX <span className="text-green-700 font-semibold">({pixDiscountPct}% off)</span></>
              ) : (
                <>compre a partir de <strong className="text-ink">{formatCurrency(pixDiscountThresholdCents)}</strong> em produtos e ganhe {pixDiscountPct}% no PIX</>
              )}
            </p>
          )}
        </div>

        {/* Estoque */}
        <div className="flex items-center gap-2 -mt-1">
          <span className={`w-2 h-2 rounded-full shrink-0 ${outOfStock ? 'bg-red-400' : availableStock <= 5 ? 'bg-amber-400' : 'bg-green-500'}`} />
          <span className="text-[12px] font-medium text-mid">
            {outOfStock
              ? 'Fora de estoque'
              : availableStock <= 5
              ? `Últimas ${availableStock} unidades`
              : 'Em estoque'}
          </span>
        </div>

        {/* Variante */}
        <div className="border-t border-mist pt-5">
          <div className="flex items-center justify-between mb-3">
            <p className="label">Tamanho / Variação</p>
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
          <Link href="/guia-de-tamanhos" className="inline-block mt-2.5 text-[11.5px] text-[#9C8878] hover:text-[#C4714A] transition-colors border-b border-dotted border-[#D4C4AE] hover:border-[#C4714A]">
            Não sabe seu tamanho? Meça o colchão e a gente te diz
          </Link>
        </div>

        {/* Quantidade */}
        {!outOfStock && (
          <div className="flex items-center justify-between border-t border-mist pt-5">
            <p className="label">Quantidade</p>
            <div className="flex items-center border border-mist">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-9 h-9 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors text-xl font-light"
                aria-label="Diminuir"
              >
                −
              </button>
              <span className="w-10 text-center text-[13px] font-semibold text-ink tabular-nums">{qty}</span>
              <button
                onClick={() => setQty(q => Math.min(availableStock, q + 1))}
                className="w-9 h-9 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors text-xl font-light"
                aria-label="Aumentar"
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* CTAs — padrão "Comprar agora" + "Adicionar ao carrinho" (Amazon) */}
        <div className="flex flex-col gap-2 border-t border-mist pt-5">
          <button
            onClick={buyNow}
            disabled={outOfStock || adding || buyingNow || !selectedVariant || loading}
            className={[
              'w-full h-13 py-3.5 text-[13px] font-semibold tracking-[0.06em] border transition-all duration-150 flex items-center justify-center gap-2',
              outOfStock || !selectedVariant
                ? 'cursor-not-allowed bg-warm text-faint border-mist'
                : buyingNow
                ? 'cursor-wait bg-ink/80 text-paper border-ink/80'
                : 'bg-ink text-paper border-ink hover:bg-clay hover:border-clay active:scale-[0.98]',
            ].join(' ')}
          >
            {buyingNow ? <><span className="spinner" />Preparando…</> : 'Comprar agora'}
          </button>
          <button
            onClick={addToCart}
            disabled={outOfStock || adding || buyingNow || !selectedVariant || loading}
            className={[
              'w-full h-13 py-3.5 text-[13px] font-semibold tracking-[0.06em] border transition-all duration-150 flex items-center justify-center gap-2',
              outOfStock || !selectedVariant
                ? 'cursor-not-allowed bg-warm text-faint border-mist'
                : adding
                ? 'cursor-wait bg-warm text-faint border-mist'
                : 'bg-paper text-ink border-ink hover:bg-warm active:scale-[0.98]',
            ].join(' ')}
          >
            {outOfStock
              ? 'Fora de estoque'
              : adding
              ? <><span className="spinner" />Adicionando…</>
              : 'Adicionar ao carrinho'}
          </button>
        </div>

        {/* Calculadora de frete — padrão Amazon/ML "Calcule o frete" */}
        <div className="border-t border-mist pt-5">
          <p className="label mb-2.5">Calcular frete e prazo</p>
          <div className="flex gap-2">
            <input
              value={cepMasked}
              onChange={e => setCep(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') calcShipping(); }}
              placeholder="00000-000"
              inputMode="numeric"
              maxLength={9}
              className="flex-1 h-10 px-3 border border-mist text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-ink transition-colors"
            />
            <button
              onClick={calcShipping}
              disabled={shipLoading}
              className="px-4 h-10 text-[12px] font-semibold border border-ink text-ink hover:bg-warm transition-colors disabled:opacity-50 shrink-0"
            >
              {shipLoading ? '…' : 'Calcular'}
            </button>
          </div>
          <a
            href="https://buscacepinter.correios.com.br/app/endereco/index.php"
            target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-faint hover:text-clay transition-colors underline underline-offset-2 mt-1.5 inline-block"
          >
            Não sei meu CEP
          </a>

          {shipError && <p className="text-[12px] text-red-600 mt-2">{shipError}</p>}

          {shipOptions && shipOptions.length > 0 && (
            <div className="mt-3 flex flex-col divide-y divide-mist border border-mist">
              {shipOptions.map((o, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <p className="text-[12px] font-medium text-ink">{o.label}</p>
                    <p className="text-[11px] text-faint">
                      {o.estimatedDays === 0 ? 'Hoje' : `${o.estimatedDays} dia${o.estimatedDays > 1 ? 's' : ''} útei${o.estimatedDays > 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <span className="text-[13px] font-semibold text-ink">
                    {o.priceCents === 0 ? 'Grátis' : formatCurrency(o.priceCents)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {shipOptions && shipOptions.length === 0 && (
            <p className="text-[12px] text-faint mt-2">Não entregamos nesse CEP no momento.</p>
          )}
        </div>
      </div>

      {/* ── Barra fixa mobile — padrão universal de PDP de marketplace ── */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-paper border-t border-mist px-4 py-3 flex items-center gap-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-ink leading-none">{formatCurrency(product.price)}</p>
          <p className="text-[10px] text-faint mt-1">{maxInstall}x de {formatCurrency(installVal)}</p>
        </div>
        <button
          onClick={buyNow}
          disabled={outOfStock || adding || buyingNow || !selectedVariant || loading}
          className={[
            'flex-1 h-11 text-[13px] font-semibold tracking-[0.04em] transition-all',
            outOfStock || !selectedVariant
              ? 'cursor-not-allowed bg-warm text-faint'
              : 'bg-ink text-paper active:scale-[0.98]',
          ].join(' ')}
        >
          {outOfStock ? 'Fora de estoque' : buyingNow ? '…' : 'Comprar agora'}
        </button>
      </div>

      {/* ── Modal: item adicionado ── */}
      {addedOpen && createPortal(
        <div
          className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center animate-fade-in"
          onClick={closeAdded}
        >
          <div
            className="w-full sm:max-w-sm bg-paper sm:mx-4 sm:rounded-sm overflow-hidden shadow-modal animate-scale-in"
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
