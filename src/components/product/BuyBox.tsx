'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { installmentFeeRate } from '@/lib/orderPricing';
import { formatCurrency } from '@/lib/utils/format';
import { SIZE_LABEL } from '@/lib/productOptions';
import type { Product, InventoryItem, ProductVariant, CartItem } from '@/types';
import { getStockUrgency } from '@/lib/stockUrgency';
import { trackAddToCart } from '@/lib/analytics';
import { useOverlay } from '@/lib/hooks/useOverlay';
import { useAuthModal } from '@/lib/auth/AuthModalContext';
import { useCartCount } from '@/lib/hooks/useCartCount';

interface Props {
  product: Product;
  inventory: InventoryItem[];
  pixDiscountThresholdCents: number;
  pixDiscountPct: number;
  note?: string; // ex: "Fronha trocada: Floral Rosa", escolhida no JogoDeCamaFronhaPicker acima
  swapSku?: string; // SKU da fronha trocada, pra reservar estoque dela junto (ver JogoDeCamaBuyBox)
  maxQty?: number; // limite extra (ex: estoque da fronha trocada cobre só N jogos)
  swapQtyPerUnit?: number; // quantas fronhas por unidade deste item (não multiplicado aqui — expandStockLines faz isso na hora de reservar/liberar)
}

interface ShipOption {
  carrier: string;
  label: string;
  priceCents: number;
  estimatedDays: number;
  tag?: 'local' | 'economico' | 'rapido';
}

export function BuyBox({ product, inventory, pixDiscountThresholdCents, pixDiscountPct, note, swapSku, swapQtyPerUnit, maxQty }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  // Começa no primeiro tamanho com estoque: se o primeiro estivesse
  // esgotado, a página inteira parecia "Fora de estoque".
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => {
    const inStock = product.variants.find(v => {
      const inv = inventory.find(i => i.sku === `${product.id}_${v.id}`);
      return !!inv && inv.quantity - inv.reserved > 0;
    });
    return (inStock ?? product.variants[0])?.id ?? null;
  });
  const [addedQty, setAddedQty] = useState(0);
  const [qtyState, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [addedOpen, setAddedOpen] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  // Visitante clicou em comprar: abre o login aqui mesmo e, ao entrar,
  // completa a ação (antes ia pra /entrar e perdia o produto).
  const [afterLogin, setAfterLogin] = useState<'cart' | 'buy' | null>(null);
  const { requireAuth } = useAuthModal();
  const cartCount = useCartCount();
  const addedPanelRef = useRef<HTMLDivElement>(null);

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

  const availableStock = Math.min(selectedVariant ? getStock(selectedVariant) : 0, maxQty ?? Infinity);
  const outOfStock = availableStock === 0;
  const urgency = getStockUrgency(availableStock);
  // Quantidade nunca passa do estoque atual (ex: trocou pra uma fronha com
  // menos estoque depois de escolher 3 jogos).
  const qty = Math.min(qtyState, Math.max(1, availableStock));

  const closeAdded = useCallback(() => setAddedOpen(false), []);
  const added = useOverlay({ open: addedOpen, onClose: closeAdded, panelRef: addedPanelRef });

  useEffect(() => {
    if (!user || !afterLogin) return;
    const action = afterLogin;
    setAfterLogin(null);
    if (action === 'cart') addToCart(); else buyNow();
  }, [user, afterLogin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preço, parcelamento e PIX, mesma lógica do checkout, uma única fonte de verdade visual ──
  const lineTotal = product.price * qty;
  // Só anuncia "sem juros" até a última parcela que é de fato sem juros
  // (tabela em lib/orderPricing; a partir de 4x o cartão cobra juros).
  const maxByValue = Math.min(8, Math.max(1, Math.floor(lineTotal / 10000)));
  let maxInstall = 1;
  for (let n = maxByValue; n >= 1; n--) { if (installmentFeeRate(n) === 0) { maxInstall = n; break; } }
  const installVal = Math.round(lineTotal / maxInstall);
  const pixEligible = pixDiscountThresholdCents > 0 && lineTotal >= pixDiscountThresholdCents;
  const pixDiscount = pixEligible ? Math.round(lineTotal * (pixDiscountPct / 100)) : 0;
  const pixTotal = lineTotal - pixDiscount;

  /** Devolve quantas unidades entraram de fato (0 se já estava no limite do estoque). */
  async function addItemToCart(finalQty: number): Promise<number> {
    if (!user || !selectedVariant) return 0;
    const sku = `${product.id}_${selectedVariant.id}`;
    // Uma escolha de fronha diferente vira uma linha separada no carrinho,
    // mesmo pro mesmo produto/variante — combinar quantidade ali juntaria
    // pedidos com trocas diferentes numa linha só, perdendo a informação.
    const lineKey = note ? `${sku}::${note}` : sku;
    const cartRef = doc(db, 'carts', user.uid);
    const cartSnap = await getDoc(cartRef);
    const existingItems: CartItem[] = cartSnap.exists() ? (cartSnap.data().items ?? []) : [];
    const existing = existingItems.find(i => (i.note ? `${i.sku}::${i.note}` : i.sku) === lineKey);
    const newQty = Math.min(availableStock, (existing?.quantity ?? 0) + finalQty);
    const delta = newQty - (existing?.quantity ?? 0);
    if (delta <= 0) return 0;

    const newItem: CartItem = {
      productId: product.id,
      productName: product.name,
      sku,
      variant: selectedVariant,
      quantity: newQty,
      unitPrice: product.price,
      image: product.images[0] ?? '',
      ...(note ? { note } : {}),
      ...(swapSku && swapQtyPerUnit ? { swapSku, swapQtyPerUnit } : {}),
    };

    const updatedItems = existing
      ? existingItems.map(i => ((i.note ? `${i.sku}::${i.note}` : i.sku) === lineKey ? newItem : i))
      : [...existingItems, newItem];

    await setDoc(cartRef, { userId: user.uid, items: updatedItems, updatedAt: serverTimestamp() }, { merge: true });
    trackAddToCart({ sku, productId: product.id, productName: product.name, unitPriceCents: product.price, quantity: delta });
    return delta;
  }

  async function addToCart() {
    if (loading) return;
    if (!user) { requireAuth(() => setAfterLogin('cart'), 'Entre pra adicionar ao carrinho. Depois disso o produto já entra sozinho.'); return; }
    if (!selectedVariant || outOfStock) return;
    setAdding(true);
    setCartError(null);
    try {
      const n = await addItemToCart(qty);
      if (n === 0) {
        // Antes mostrava "Adicionado" mesmo sem adicionar nada.
        setCartError('Você já tem no carrinho todo o estoque disponível deste item.');
      } else {
        setAddedQty(n);
        setAddedOpen(true);
      }
    } catch (err) {
      console.error('addToCart error:', err);
      setCartError('Não foi possível adicionar ao carrinho. Verifique sua conexão e tente de novo.');
    } finally {
      setAdding(false);
    }
  }

  async function buyNow() {
    if (loading) return;
    if (!user) { requireAuth(() => setAfterLogin('buy'), 'Entre pra finalizar a compra. Você continua de onde parou.'); return; }
    if (!selectedVariant || outOfStock) return;
    setBuyingNow(true);
    setCartError(null);
    try {
      await addItemToCart(qty);
      router.push('/checkout');
    } catch (err) {
      console.error('buyNow error:', err);
      setCartError('Não foi possível adicionar ao carrinho. Verifique sua conexão e tente de novo.');
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
      <div className="border border-mist bg-paper rounded-3xl p-5 sm:p-7 flex flex-col gap-5">

        {/* Preço */}
        <div>
          <p className="font-display text-[2rem] leading-none text-ink font-normal tracking-[-0.02em]">
            {formatCurrency(product.price)}
          </p>
          {maxInstall > 1 && (
            <p className="text-[12px] text-mid mt-1.5">
              em até <strong className="text-ink">{maxInstall}x de {formatCurrency(installVal)}</strong> sem juros
            </p>
          )}
          {pixDiscountThresholdCents > 0 && (
            <p className="mt-3 flex items-start gap-2 bg-warm/70 rounded-xl px-3.5 py-2.5 text-[12px] text-mid leading-snug">
              <svg width="14" height="14" viewBox="0 0 512 512" className="shrink-0 mt-px fill-[#32BCAD]" aria-hidden="true"><path d="M242.4 292.5C247.8 287.1 257.1 287.1 262.5 292.5L339.5 369.5C353.7 383.7 372.6 391.5 392.6 391.5H407.7L310.6 488.6C280.3 518.1 231.1 518.1 200.8 488.6L103.3 391.2H112.6C132.6 391.2 151.5 383.4 165.7 369.2L242.4 292.5zM262.5 218.9C256.1 224.4 247.9 224.5 242.4 218.9L165.7 142.2C151.5 127.1 132.6 120.2 112.6 120.2H103.3L200.7 22.76C231.1-7.586 280.3-7.586 310.6 22.76L407.8 119.9H392.6C372.6 119.9 353.7 127.7 339.5 141.9L262.5 218.9zM112.6 142.7C126.4 142.7 139.1 148.3 149.7 158.1L226.4 234.8C233.6 241.1 243 245.6 252.5 245.6C261.9 245.6 271.3 241.1 278.5 234.8L355.5 157.8C365.3 148.1 378.8 142.5 392.6 142.5H430.3L488.6 200.8C518.9 231.1 518.9 280.3 488.6 310.6L430.3 368.9H392.6C378.8 368.9 365.3 363.3 355.5 353.5L278.5 276.5C264.6 262.6 240.3 262.6 226.4 276.6L149.7 353.2C139.1 363 126.4 368.6 112.6 368.6H80.78L22.76 310.6C-7.586 280.3-7.586 231.1 22.76 200.8L80.78 142.7H112.6z"/></svg>
              <span>
                {pixEligible ? (
                  <>ou <strong className="text-ink">{formatCurrency(pixTotal)}</strong> à vista no PIX, {pixDiscountPct}% de desconto</>
                ) : (
                  <>{pixDiscountPct}% de desconto no PIX em compras a partir de <strong className="text-ink">{formatCurrency(pixDiscountThresholdCents)}</strong></>
                )}
              </span>
            </p>
          )}
        </div>

        {/* Estoque */}
        <div className={`flex items-center gap-2 -mt-1 ${urgency?.level === 'critical' ? 'animate-pulse-subtle' : ''}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${outOfStock ? 'bg-red-400' : urgency?.level === 'critical' ? 'bg-clay' : urgency?.level === 'warning' ? 'bg-amber-400' : 'bg-green-500'}`} />
          <span className={`text-[12px] font-medium ${urgency?.level === 'critical' ? 'text-clay font-semibold' : 'text-mid'}`}>
            {outOfStock ? 'Fora de estoque' : urgency ? urgency.text : 'Em estoque'}
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
                  aria-pressed={isSelected}
                  className={[
                    'relative rounded-full border px-4 py-2.5 text-[13px] font-medium transition-all duration-150',
                    isSelected
                      ? 'border-ink bg-ink text-paper'
                      : unavailable
                      ? 'cursor-not-allowed border-mist text-faint'
                      : 'border-mist text-mid hover:border-ink/50 hover:text-ink',
                  ].join(' ')}
                >
                  {unavailable && (
                    <span className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
                      <span className="absolute top-[calc(50%-0.5px)] left-0 w-[141%] h-px bg-mist origin-left rotate-[-27deg] translate-x-[-10%]" />
                    </span>
                  )}
                  <span className="inline-flex items-center gap-2">
                    {variant.color && (
                      <span
                        className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: variant.color }}
                        aria-hidden="true"
                      />
                    )}
                    {SIZE_LABEL[variant.size] ?? variant.size}
                    {variant.colorName ? ` · ${variant.colorName}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
          <Link href="/guia-de-tamanhos" className="inline-block mt-2.5 text-[11.5px] text-faint hover:text-clay-l transition-colors border-b border-dotted border-faint-l hover:border-clay-l">
            Não sabe seu tamanho? Meça o colchão e a gente te diz
          </Link>
        </div>

        {/* Quantidade */}
        {!outOfStock && (
          <div className="flex items-center justify-between border-t border-mist pt-5">
            <p className="label">Quantidade</p>
            <div className="flex items-center rounded-full border border-mist overflow-hidden">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                disabled={qty <= 1}
                className="w-9 h-9 rounded-full flex disabled:opacity-30 disabled:pointer-events-none items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors text-xl font-light"
                aria-label="Diminuir"
              >
                −
              </button>
              <span className="w-10 text-center text-[13px] font-semibold text-ink tabular-nums">{qty}</span>
              <button
                onClick={() => setQty(Math.min(availableStock, qty + 1))}
                disabled={qty >= availableStock}
                className="w-9 h-9 rounded-full flex disabled:opacity-30 disabled:pointer-events-none items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors text-xl font-light"
                aria-label="Aumentar"
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* CTAs, padrão "Comprar agora" + "Adicionar ao carrinho" (Amazon).
            Em mobile essas ações moram só na barra fixa abaixo, pra não duplicar o CTA. */}
        <div className="hidden sm:flex flex-col gap-2 border-t border-mist pt-5">
          <button
            onClick={buyNow}
            disabled={outOfStock || adding || buyingNow || !selectedVariant || loading}
            className={[
              'w-full h-13 py-3.5 rounded-full text-[13px] font-semibold tracking-[0.06em] border transition-all duration-150 flex items-center justify-center gap-2',
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
              'w-full h-13 py-3.5 rounded-full text-[13px] font-semibold tracking-[0.06em] border transition-all duration-150 flex items-center justify-center gap-2',
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
              ? <><span className="spinner-dark" />Adicionando…</>
              : 'Adicionar ao carrinho'}
          </button>
          {cartError && <p role="alert" className="text-[12px] text-red-600 leading-snug">{cartError}</p>}
        </div>

        {/* Calculadora de frete, padrão Amazon/ML "Calcule o frete" */}
        <div className="border-t border-mist pt-5">
          <p className="label mb-2.5">Calcular frete e prazo</p>
          <div className="flex gap-2">
            <input
              value={cepMasked}
              onChange={e => setCep(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') calcShipping(); }}
              placeholder="00000-000"
              aria-label="CEP para calcular o frete"
              inputMode="numeric"
              maxLength={9}
              className="flex-1 min-w-0 h-10 px-4 rounded-full border border-mist bg-paper text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-ink transition-colors appearance-none"
            />
            <button
              onClick={calcShipping}
              disabled={shipLoading}
              className="px-5 h-10 rounded-full text-[12px] font-semibold border border-ink text-ink hover:bg-warm transition-colors disabled:opacity-50 shrink-0"
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
            <div className="mt-3 flex flex-col divide-y divide-mist border border-mist rounded-2xl overflow-hidden">
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

      {/* ── Barra fixa mobile, padrão universal de PDP de marketplace ── */}
      <div data-mobile-buybar className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-paper border-t border-mist px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        {cartError && (
          <p role="alert" className="absolute bottom-full inset-x-0 bg-red-50 border-t border-red-200 text-red-700 text-[12px] leading-snug px-4 py-2">
            {cartError}
          </p>
        )}
        <div className="min-w-0">
          <p className="font-display text-[1.2rem] text-ink leading-none tabular-nums">{formatCurrency(product.price)}</p>
          {maxInstall > 1 && <p className="text-[10px] text-faint mt-1">{maxInstall}x de {formatCurrency(installVal)}</p>}
        </div>
        {!outOfStock && (
          <button
            onClick={addToCart}
            disabled={adding || buyingNow || !selectedVariant || loading}
            aria-label="Adicionar ao carrinho"
            title="Adicionar ao carrinho"
            className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center border border-ink text-ink hover:bg-warm active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            {adding ? (
              <span className="spinner-dark" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
            )}
          </button>
        )}
        <button
          onClick={buyNow}
          disabled={outOfStock || adding || buyingNow || !selectedVariant || loading}
          className={[
            'flex-1 h-11 rounded-full text-[13px] font-semibold tracking-[0.04em] transition-[background-color,transform] duration-150',
            outOfStock || !selectedVariant
              ? 'cursor-not-allowed bg-warm text-faint'
              : 'bg-ink text-paper active:scale-[0.98]',
          ].join(' ')}
        >
          {outOfStock ? 'Fora de estoque' : buyingNow ? <span className="inline-flex items-center gap-2"><span className="spinner" />Preparando…</span> : 'Comprar agora'}
        </button>
      </div>

      {/* ── Modal: item adicionado ── */}
      {added.mounted && createPortal(
        <div
          className="overlay-backdrop fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
          data-state={added.state}
          onClick={closeAdded}
        >
          <div
            ref={addedPanelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="added-title"
            data-variant="responsive"
            className="overlay-panel w-full sm:max-w-sm bg-paper sm:mx-4 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-modal pb-[env(safe-area-inset-bottom)] sm:pb-0"
            onClick={e => e.stopPropagation()}
          >
            {/* Alça do bottom sheet no celular */}
            <span aria-hidden="true" className="sm:hidden mx-auto mt-2.5 block h-1 w-10 rounded-full bg-mist-d" />
            <div className="px-6 pt-5 sm:pt-6 pb-5">
              <div className="flex items-center gap-2.5 mb-4">
                <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300 flex items-center justify-center shrink-0 animate-heart-pop">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                <h3 id="added-title" className="font-display font-normal text-ink text-[1.25rem] leading-none">Adicionado ao carrinho</h3>
              </div>
              {/* O que entrou: foto, variação e valor */}
              <div className="flex items-center gap-3.5 rounded-2xl bg-warm/60 p-3">
                <span className="relative w-14 h-[70px] shrink-0 rounded-xl overflow-hidden bg-warm">
                  {product.images[0] && <Image src={product.images[0]} alt="" fill sizes="56px" className="object-cover" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-ink leading-snug line-clamp-2">{product.name}</p>
                  {selectedVariant && (
                    <p className="text-[12px] text-mid mt-0.5 truncate">{SIZE_LABEL[selectedVariant.size] ?? selectedVariant.size}{selectedVariant.colorName ? ` · ${selectedVariant.colorName}` : ''}</p>
                  )}
                  <p className="text-[12.5px] text-ink mt-1 tabular-nums">{addedQty} × {formatCurrency(product.price)}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 px-6 pb-6">
              <button
                type="button"
                autoFocus
                onClick={() => router.push('/carrinho')}
                className="w-full h-12 rounded-full text-[13px] font-semibold tracking-[0.06em] bg-ink text-paper border border-ink hover:bg-clay hover:border-clay active:scale-[0.98] transition-[background-color,border-color,transform] duration-150"
              >
                Ver carrinho{cartCount > 0 ? ` (${cartCount} ${cartCount === 1 ? 'item' : 'itens'})` : ''}
              </button>
              <button
                type="button"
                onClick={closeAdded}
                className="w-full h-12 rounded-full text-[13px] font-semibold tracking-[0.06em] text-mid border border-mist hover:border-ink/50 hover:text-ink active:scale-[0.98] transition-[border-color,color,transform] duration-150"
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
