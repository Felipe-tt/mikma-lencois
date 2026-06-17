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

const FREE_SHIPPING_THRESHOLD = 25000; // R$250 — fallback; ideally from settings

export default function CartPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [cart, setCart]           = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [couponCode, setCouponCode]   = useState('');
  const [couponOpen, setCouponOpen]   = useState(false);
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError]   = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

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

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true); setCouponError('');
    try {
      const snap = await getDocs(query(collection(db, 'coupons'),
        where('code', '==', couponCode.toUpperCase().trim()),
        where('active', '==', true)
      ));
      if (snap.empty) { setCouponError('Cupom inválido ou expirado.'); return; }
      const c = snap.docs[0].data();
      if (c.expiresAt && new Date(c.expiresAt) < new Date()) { setCouponError('Cupom expirado.'); return; }
      if (c.uses >= c.maxUses) { setCouponError('Cupom esgotado.'); return; }
      if (c.minOrderCents > 0 && subtotal < c.minOrderCents) {
        setCouponError(`Pedido mínimo: ${formatCurrency(c.minOrderCents)}`); return;
      }
      const discount = c.type === 'percent' ? Math.round(subtotal * c.value / 100) : c.value * 100;
      setCouponApplied({ code: couponCode.toUpperCase().trim(), discount });
    } catch { setCouponError('Erro ao verificar cupom.'); }
    finally { setCouponLoading(false); }
  }

  const items: CartItem[] = cart?.items ?? [];
  const subtotal = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);
  const discount = couponApplied?.discount ?? 0;
  const total = Math.max(0, subtotal - discount);

  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const progress  = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  const freeShip  = subtotal >= FREE_SHIPPING_THRESHOLD;

  return (
    <div>
      {/* Page header — inline, no bg-warm */}
      <div className="border-b border-mist bg-warm/60">
        <div className="container-shop py-10">
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl">Carrinho</h1>
        </div>
      </div>

      {loading || cartLoading ? (
        <CartSkeleton />
      ) : items.length === 0 ? (
        <div className="container-shop py-24 sm:py-32 max-w-md mx-auto text-center">
          <svg className="mx-auto mb-6 text-faint" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
          <h2 className="font-display font-normal text-ink text-3xl mb-3">Carrinho vazio</h2>
          <p className="text-[14px] text-mid mb-8 leading-relaxed">
            Explore nossos lençóis e adicione itens ao carrinho.
          </p>
          <Link href="/produtos" className="btn-primary">Ver produtos</Link>
        </div>
      ) : (
        <div className="container-shop pb-24">

          {/* Free shipping bar */}
          {FREE_SHIPPING_THRESHOLD > 0 && (
            <div className="mb-6 py-3 border-b border-mist">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[12px] font-medium text-mid">
                  {freeShip
                    ? <span className="text-clay font-semibold flex items-center gap-1.5"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Frete grátis desbloqueado!</span>
                    : <>Faltam <strong className="text-ink">{formatCurrency(remaining)}</strong> para frete grátis</>
                  }
                </span>
                <span className="text-[11px] text-faint tabular-nums">{Math.round(progress)}%</span>
              </div>
              <div className="h-0.5 bg-mist overflow-hidden">
                <div className="h-full bg-clay transition-all duration-500" style={{width: `${progress}%`}} />
              </div>
            </div>
          )}

          <div className="flex flex-col lg:grid lg:grid-cols-[1fr_380px] gap-8 lg:gap-12 items-start">

            {/* ── Items list ── */}
            <div className="flex flex-col divide-y divide-mist">
              {items.map(item => (
                <div key={item.sku} className="flex gap-4 sm:gap-5 py-5 sm:py-6">
                  {/* Bigger image */}
                  <div className="relative w-24 h-[120px] sm:w-28 sm:h-[140px] shrink-0 overflow-hidden bg-warm">
                    {item.image
                      ? <Image src={item.image} alt={item.productName} fill sizes="112px" className="object-cover" />
                      : <div className="flex h-full items-center justify-center"><span className="font-display text-2xl text-faint/40">M</span></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <p className="text-[13px] font-semibold text-ink leading-snug">{item.productName}</p>
                    <p className="text-[11px] text-faint">
                      {item.variant?.size}{item.variant?.fabric ? ` · ${item.variant.fabric}` : ''}{item.variant?.color ? ` · ${item.variant.color}` : ''}
                    </p>
                    <p className="font-display text-[1.15rem] text-ink mt-auto">{formatCurrency(item.unitPrice)}</p>
                  </div>
                  <div className="flex flex-col items-end justify-between shrink-0">
                    <button onClick={() => removeItem(item.sku)} className="text-[11px] text-faint hover:text-red-500 transition-colors font-medium">
                      Remover
                    </button>
                    <div className="flex items-center border border-mist" style={{borderRadius:'2px'}}>
                      <button onClick={() => updateQty(item.sku, item.quantity - 1)}
                        className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors text-base">
                        −
                      </button>
                      <span className="w-8 sm:w-9 text-center text-[13px] font-medium text-ink">{item.quantity}</span>
                      <button onClick={() => updateQty(item.sku, item.quantity + 1)}
                        className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors text-base">
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Coupon */}
              <div className="py-4">
                {!couponOpen ? (
                  <button onClick={() => setCouponOpen(true)} className="text-[12px] font-medium text-mid hover:text-clay transition-colors flex items-center gap-1.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                    Tem um cupom de desconto?
                  </button>
                ) : couponApplied ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200/80 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-emerald-700">✓ {couponApplied.code}</span>
                      <span className="text-[12px] text-emerald-600">— {formatCurrency(couponApplied.discount)} de desconto</span>
                    </div>
                    <button onClick={() => { setCouponApplied(null); setCouponCode(''); }} className="text-[11px] text-emerald-500 hover:text-emerald-700 font-semibold">Remover</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input value={couponCode} onChange={e => setCouponCode(e.target.value)}
                      placeholder="Código do cupom"
                      className="input input-sm flex-1 uppercase placeholder:normal-case placeholder:text-faint"
                      onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                    />
                    <button onClick={applyCoupon} disabled={couponLoading}
                      className="btn-outline text-[11px] font-bold tracking-[0.1em] uppercase px-4 py-2">
                      {couponLoading ? '...' : 'Aplicar'}
                    </button>
                    <button onClick={() => setCouponOpen(false)} className="text-faint hover:text-mid transition-colors px-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                )}
                {couponError && <p className="mt-2 text-[11px] text-red-600">{couponError}</p>}
              </div>
            </div>

            {/* ── Summary ── */}
            <div className="w-full border border-mist/80 p-5 sm:p-6 flex flex-col gap-4 lg:sticky lg:top-24" style={{borderRadius:'2px'}}>
              <h2 className="font-display font-normal text-ink text-xl">Resumo</h2>

              <div className="flex flex-col gap-2.5 text-[13px]">
                <div className="flex justify-between text-mid">
                  <span>Subtotal ({items.length} {items.length !== 1 ? 'itens' : 'item'})</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {couponApplied && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Desconto ({couponApplied.code})</span>
                    <span>−{formatCurrency(couponApplied.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-faint text-[11px]">
                  <span>Frete</span>
                  <span>{freeShip ? <span className="text-clay font-medium">Grátis</span> : 'calculado no checkout'}</span>
                </div>
              </div>

              <div className="border-t border-mist pt-3 flex justify-between items-baseline">
                <span className="text-[13px] font-semibold text-ink">Total</span>
                <span className="font-display text-[1.6rem] text-ink">{formatCurrency(total)}</span>
              </div>

              <Link href="/checkout" className="btn h-14 w-full bg-ink text-paper border-ink hover:bg-clay hover:border-clay active:scale-[0.98] text-[13px] font-semibold tracking-[0.06em] transition-all duration-150">
                Finalizar compra
              </Link>

              <div className="flex flex-col items-center gap-2">
                <Link href="/produtos" className="text-center text-[11px] text-faint hover:text-clay transition-colors font-medium">
                  ← Continuar comprando
                </Link>
                <p className="text-[10px] text-faint/70 text-center">Pagamento seguro via PIX</p>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
