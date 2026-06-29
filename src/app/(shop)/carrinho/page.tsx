'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrency } from '@/lib/utils/format';
import { useRouter } from 'next/navigation';
import type { Cart, CartItem } from '@/types';
import { CartSkeleton } from '@/components/ui/Skeleton';

export default function CartPage() {
  const [threshold, setThreshold] = useState(25000);
  const { user, loading } = useAuth();
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [stockMap, setStockMap] = useState<Record<string, number>>({}); // sku → disponível
  const [couponCode, setCouponCode] = useState('');
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/public').then(r => r.json()).then(d => {
      if (d.freeShippingThresholdCents > 0) setThreshold(d.freeShippingThresholdCents);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    return onSnapshot(doc(db, 'carts', user.uid), snap => {
      setCart(snap.exists() ? snap.data() as Cart : null);
      setCartLoading(false);
    });
  }, [user, loading, router]);

  // Busca estoque disponível para todos os SKUs do carrinho
  useEffect(() => {
    const items: CartItem[] = cart?.items ?? [];
    if (items.length === 0) { setStockMap({}); return; }
    const skus = items.map(i => i.sku);
    Promise.all(
      skus.map(sku =>
        getDocs(query(collection(db, 'inventory'), where('sku', '==', sku))).then(snap => {
          const inv = snap.docs[0]?.data();
          return { sku, available: inv ? Math.max(0, (inv.quantity ?? 0) - (inv.reserved ?? 0)) : 99 };
        })
      )
    ).then(results => {
      setStockMap(Object.fromEntries(results.map(r => [r.sku, r.available])));
    }).catch(() => {});
  }, [cart]);

  async function removeItem(sku: string) {
    if (!user || !cart) return;
    setRemoving(sku);
    await updateDoc(doc(db, 'carts', user.uid), { items: cart.items.filter(i => i.sku !== sku) });
    setRemoving(null);
  }
  async function updateQty(sku: string, qty: number) {
    if (!user || !cart) return;
    if (qty < 1) { await removeItem(sku); return; }
    await updateDoc(doc(db, 'carts', user.uid), {
      items: cart.items.map(i => i.sku === sku ? { ...i, quantity: qty } : i),
    });
  }

  async function applyCoupon() {
    if (!couponCode.trim() || !user) return;
    setCouponLoading(true); setCouponError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/checkout/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: couponCode.trim(), orderCents: subtotal }),
      });
      const data = await res.json();
      if (!res.ok) { setCouponError(data.error ?? 'Cupom inválido.'); return; }
      const { discountCents } = data;
      setCouponApplied({ code: couponCode.toUpperCase().trim(), discount: discountCents });
      // Persiste no carrinho para o checkout e backend lerem
      await updateDoc(doc(db, 'carts', user.uid), { couponCode: couponCode.toUpperCase().trim() });
    } catch { setCouponError('Erro ao verificar cupom. Tente novamente.'); }
    finally { setCouponLoading(false); }
  }

  async function removeCoupon() {
    if (!user) return;
    setCouponApplied(null);
    setCouponCode('');
    await updateDoc(doc(db, 'carts', user.uid), { couponCode: null });
  }

  const items: CartItem[] = cart?.items ?? [];
  const subtotal = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);
  const discount = couponApplied?.discount ?? 0;
  const total = Math.max(0, subtotal - discount);
  const remaining = Math.max(0, threshold - subtotal);
  const progress = Math.min(100, threshold > 0 ? (subtotal / threshold) * 100 : 0);
  const freeShip = threshold > 0 && subtotal >= threshold;
  const totalItems = items.reduce((a, i) => a + i.quantity, 0);

  if (loading || cartLoading) return <CartSkeleton />;

  if (items.length === 0) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 border border-mist rounded-full flex items-center justify-center mb-6">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-faint">
          <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 01-8 0"/>
        </svg>
      </div>
      <h2 className="font-display font-normal text-ink text-3xl mb-3">Carrinho vazio</h2>
      <p className="text-sm text-mid mb-8 max-w-[28ch] leading-relaxed">Explore nossos produtos e escolha os seus lençóis.</p>
      <Link href="/produtos" className="btn-primary px-8 py-3.5 text-sm font-semibold tracking-wide">Ver produtos</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-mist">
        <div className="container-shop py-8 flex items-baseline justify-between gap-4">
          <h1 className="font-display font-normal text-ink text-3xl sm:text-4xl">Carrinho</h1>
          <span className="text-sm text-faint">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</span>
        </div>
      </div>

      {/* Barra frete grátis */}
      {threshold > 0 && (
        <div className={`border-b transition-colors ${freeShip ? 'bg-emerald-50 border-emerald-100' : 'bg-warm border-mist'}`}>
          <div className="container-shop py-3">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold ${freeShip ? 'text-emerald-700' : 'text-mid'}`}>
                {freeShip
                  ? <span className="flex items-center gap-1">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Frete grátis desbloqueado para este pedido
                    </span>
                  : <><strong className="text-ink">{formatCurrency(remaining)}</strong> para frete grátis</>
                }
              </span>
              <span className="text-xs text-faint tabular-nums font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="h-[3px] bg-mist/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 w-[var(--w)] ${freeShip ? 'bg-emerald-500' : 'bg-ink'}`}
                style={{ '--w': `${progress}%` } as React.CSSProperties}
              />
            </div>
          </div>
        </div>
      )}

      <div className="container-shop py-8 pb-24">
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_360px] gap-10 lg:gap-16 items-start">

          {/* ── Itens ── */}
          <div>
            <div className="divide-y divide-mist/70">
              {items.map(item => (
                <div
                  key={item.sku}
                  className={`flex gap-4 sm:gap-5 py-6 transition-opacity ${removing === item.sku ? 'opacity-40 pointer-events-none' : ''}`}
                >
                  {/* Imagem */}
                  <Link href={`/produtos/${item.productId}`} className="relative shrink-0 w-20 h-24 sm:w-24 sm:h-28 bg-warm overflow-hidden border border-mist/60 block">
                    {item.image
                      ? <Image src={item.image} alt={item.productName} fill sizes="96px" className="object-cover hover:scale-105 transition-transform duration-300" />
                      : <div className="h-full flex items-center justify-center"><span className="font-display text-2xl text-faint/30">M</span></div>
                    }
                  </Link>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <Link href={`/produtos/${item.productId}`} className="text-sm font-semibold text-ink leading-snug hover:text-clay transition-colors line-clamp-2">
                      {item.productName}
                    </Link>
                    {(item.variant?.size || item.variant?.fabric || item.variant?.color) && (
                      <p className="text-xs text-faint">
                        {[item.variant.size, item.variant.fabric, item.variant.color].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {(() => {
                      const avail = stockMap[item.sku];
                      if (avail === 0) return <p className="text-xs text-red-500 font-semibold">Fora de estoque — remova do carrinho</p>;
                      if (avail !== undefined && avail <= 5) return <p className="text-xs text-amber-600 font-semibold">Apenas {avail} {avail === 1 ? 'unidade disponível' : 'unidades disponíveis'}</p>;
                      return null;
                    })()}
                    <p className="text-base font-semibold text-ink mt-auto">{formatCurrency(item.unitPrice)}</p>
                  </div>

                  {/* Qtd + remove */}
                  <div className="flex flex-col items-end justify-between shrink-0">
                    <button
                      onClick={() => removeItem(item.sku)}
                      className="text-xs text-faint hover:text-red-500 transition-colors font-medium"
                    >
                      Remover
                    </button>
                    <div className="flex items-center border border-mist">
                      <button
                        onClick={() => updateQty(item.sku, item.quantity - 1)}
                        className="w-9 h-9 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors"
                        aria-label="Diminuir"
                      >
                        <svg width="12" height="2" viewBox="0 0 12 2" fill="currentColor"><rect width="12" height="2" rx="1"/></svg>
                      </button>
                      <span className="w-9 text-center text-sm font-semibold text-ink tabular-nums">{item.quantity}</span>
                      <button
                        onClick={() => { const avail = stockMap[item.sku] ?? 99; if (item.quantity < avail) updateQty(item.sku, item.quantity + 1); }}
                        disabled={(stockMap[item.sku] ?? 99) <= item.quantity}
                        className="w-9 h-9 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Aumentar"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 0a1 1 0 011 1v4h4a1 1 0 110 2H7v4a1 1 0 11-2 0V7H1a1 1 0 010-2h4V1a1 1 0 011-1z"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Cupom */}
            <div className="mt-4 pt-4 border-t border-mist/70">
              {!couponOpen && !couponApplied ? (
                <button
                  onClick={() => setCouponOpen(true)}
                  className="flex items-center gap-2 text-xs text-mid hover:text-clay transition-colors font-medium"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                    <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"/>
                  </svg>
                  Adicionar cupom de desconto
                </button>
              ) : couponApplied ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-sm">
                  <div className="flex items-center gap-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                    <div>
                      <span className="text-xs font-bold tracking-[0.1em] text-emerald-800">{couponApplied.code}</span>
                      <span className="text-xs text-emerald-600 ml-2">{formatCurrency(couponApplied.discount)} de desconto</span>
                    </div>
                  </div>
                  <button onClick={() => { removeCoupon(); setCouponOpen(false); }} className="text-xs text-emerald-500 hover:text-emerald-700 font-semibold">Remover</button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <input
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value)}
                      placeholder="Código do cupom"
                      className="input flex-1 text-sm uppercase placeholder:normal-case placeholder:text-faint"
                      onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                      autoFocus
                    />
                    <button
                      onClick={applyCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      className="px-4 py-2.5 bg-ink text-paper text-xs font-bold tracking-[0.08em] uppercase disabled:opacity-50 hover:bg-clay transition-colors"
                    >
                      {couponLoading ? '...' : 'Aplicar'}
                    </button>
                    <button onClick={() => { setCouponOpen(false); setCouponError(''); }} className="text-faint hover:text-mid transition-colors px-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  {couponError && <p className="text-xs text-red-500">{couponError}</p>}
                </div>
              )}
            </div>
          </div>

          {/* ── Resumo — sticky ── */}
          <div className="w-full lg:sticky lg:top-6">
            <div className="border border-mist bg-warm/30">
              <div className="px-5 py-4 border-b border-mist">
                <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-faint">Resumo do pedido</h2>
              </div>

              <div className="px-5 py-4 flex flex-col gap-3">
                <div className="flex justify-between text-sm text-mid">
                  <span>Subtotal ({totalItems} {totalItems === 1 ? 'item' : 'itens'})</span>
                  <span className="text-ink font-medium">{formatCurrency(subtotal)}</span>
                </div>

                {couponApplied && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Desconto ({couponApplied.code})</span>
                    <span className="font-semibold">{formatCurrency(couponApplied.discount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm">
                  <span className="text-faint">Frete</span>
                  <span className={freeShip ? 'text-emerald-600 font-semibold text-xs' : 'text-faint text-xs'}>
                    {freeShip ? 'Grátis' : 'Calculado no checkout'}
                  </span>
                </div>
              </div>

              <div className="px-5 pb-4 border-t border-mist pt-4 flex justify-between items-baseline">
                <span className="text-sm font-semibold text-ink">Total estimado</span>
                <span className="font-display text-2xl text-ink">{formatCurrency(total)}</span>
              </div>

              <div className="px-5 pb-5">
                <Link
                  href="/checkout"
                  className="flex items-center justify-center w-full h-14 bg-ink text-paper text-sm font-semibold tracking-[0.05em] hover:bg-clay transition-colors duration-200 active:scale-[0.99]"
                >
                  Finalizar compra
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="ml-2 opacity-60">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </Link>              </div>
            </div>

            {/* Selos mini */}
            <div className="mt-4 flex flex-col gap-2 px-1">
              {[
                'Troca em até 7 dias após o recebimento',
              ].map((text) => (
                <div key={text} className="flex items-center gap-2.5 text-xs text-faint">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-[#705A48]"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/></svg>
                  <span>{text}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 text-center">
              <Link href="/produtos" className="text-xs text-faint hover:text-clay transition-colors">
                Continuar comprando
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
