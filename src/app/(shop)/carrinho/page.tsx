'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrency } from '@/lib/utils/format';
import { useRouter } from 'next/navigation';
import type { Cart, CartItem } from '@/types';
import { CartSkeleton } from '@/components/ui/Skeleton';
import { getStockUrgency } from '@/lib/stockUrgency';
import { SIZE_LABEL } from '@/lib/productOptions';
import { setReturnTo } from '@/lib/auth/returnTo';

export default function CartPage() {
  // 0 = loja sem frete grátis. Antes começava em R$ 250 e só trocava se a
  // config fosse > 0: com frete grátis desligado o carrinho prometia
  // "Grátis" e o servidor cobrava o frete.
  const [threshold, setThreshold] = useState(0);
  const [cartError, setCartError] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [stockMap, setStockMap] = useState<Record<string, number>>({}); // sku → disponível
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({}); // productId → ativo
  const [couponCode, setCouponCode] = useState('');
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [itemError, setItemError] = useState('');

  useEffect(() => {
    fetch('/api/settings/public').then(r => r.json()).then(d => {
      setThreshold(Math.max(0, Number(d.freeShippingThresholdCents) || 0));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { setReturnTo('/carrinho'); router.push('/entrar'); return; }
    return onSnapshot(doc(db, 'carts', user.uid), snap => {
      setCart(snap.exists() ? snap.data() as Cart : null);
      setCartError(false);
      setCartLoading(false);
    }, () => {
      // Sem isso o esqueleto ficava pra sempre se a leitura falhasse.
      setCartError(true);
      setCartLoading(false);
    });
  }, [user, loading, router]);

  // Busca estoque disponível para todos os SKUs do carrinho
  useEffect(() => {
    const items: CartItem[] = cart?.items ?? [];
    if (items.length === 0) { setStockMap({}); return; }
    // Inclui a fronha trocada (Jogo de Cama): ela também precisa ter estoque.
    const skus = Array.from(new Set(items.flatMap(i => i.swapSku ? [i.sku, i.swapSku] : [i.sku])));
    Promise.all(
      skus.map(sku =>
        getDoc(doc(db, 'inventory', sku)).then(snap => {
          const inv = snap.data();
          return { sku, available: inv ? Math.max(0, (inv.quantity ?? 0) - (inv.reserved ?? 0)) : 99 };
        })
      )
    ).then(results => {
      setStockMap(Object.fromEntries(results.map(r => [r.sku, r.available])));
    }).catch(() => {});
  }, [cart]);

  // Produto pode ter sido desativado (removido do catálogo) depois de já
  // estar no carrinho de alguém — sem checar isso aqui, a pessoa só
  // descobriria no checkout (ou, sem essa validação, nem descobriria:
  // era possível comprar um produto desativado que ficou esquecido no
  // carrinho). Busca em paralelo com o estoque, por productId.
  useEffect(() => {
    const items: CartItem[] = cart?.items ?? [];
    if (items.length === 0) { setActiveMap({}); return; }
    const productIds = Array.from(new Set(items.map(i => i.productId)));
    Promise.all(
      productIds.map(id => getDoc(doc(db, 'products', id)).then(snap => ({ id, active: snap.exists() ? snap.data().active !== false : false })))
    ).then(results => {
      setActiveMap(Object.fromEntries(results.map(r => [r.id, r.active])));
    }).catch(() => {});
  }, [cart]);

  // Item esgotado ou com quantidade acima do estoque também trava o botão:
  // antes passava daqui e o erro só aparecia no último passo do checkout.
  const hasUnavailableItem = (cart?.items ?? []).some(item =>
    activeMap[item.productId] === false ||
    (stockMap[item.sku] !== undefined && stockMap[item.sku] < item.quantity) ||
    (!!item.swapSku && stockMap[item.swapSku] !== undefined && stockMap[item.swapSku] < item.quantity * (item.swapQtyPerUnit ?? 1))
  );

  const subtotalForCoupon = (cart?.items ?? []).reduce((a, i) => a + i.unitPrice * i.quantity, 0);

  // Cupom gravado no carrinho: o servidor usa no pagamento, então a tela
  // mostra o desconto também, e recalcula quando o subtotal muda (antes o
  // desconto ficava o da hora em que foi aplicado, mesmo tirando itens).
  useEffect(() => {
    const saved = cart?.couponCode;
    if (!user || !saved || subtotalForCoupon <= 0) return;
    let cancelled = false;
    user.getIdToken().then(token => fetch('/api/checkout/validate-coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: saved, orderCents: subtotalForCoupon }),
    })).then(async res => {
      if (cancelled) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCouponApplied({ code: saved, discount: data.discountCents ?? 0 });
      else {
        // Cupom deixou de valer (expirou, esgotou): tira do carrinho e avisa.
        setCouponError(data.error ?? `O cupom ${saved} não é mais válido.`);
        updateDoc(doc(db, 'carts', user.uid), { couponCode: null }).catch(() => {});
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [cart?.couponCode, user, subtotalForCoupon]);

  async function removeItem(sku: string, note?: string) {
    if (!user || !cart) return;
    setRemoving(note ? `${sku}::${note}` : sku);
    setItemError('');
    try {
      await updateDoc(doc(db, 'carts', user.uid), { items: cart.items.filter(i => !(i.sku === sku && i.note === note)) });
    } catch {
      setItemError('Não foi possível remover o item. Verifique sua conexão e tente de novo.');
    } finally {
      setRemoving(null);
    }
  }
  async function updateQty(sku: string, qty: number, note?: string) {
    if (!user || !cart) return;
    if (qty < 1) { await removeItem(sku, note); return; }
    setItemError('');
    try {
      await updateDoc(doc(db, 'carts', user.uid), {
        items: cart.items.map(i => (i.sku === sku && i.note === note) ? { ...i, quantity: qty } : i),
      });
    } catch {
      setItemError('Não foi possível atualizar a quantidade. Verifique sua conexão e tente de novo.');
    }
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

  if (cartError) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-2xl text-ink mb-2">Não conseguimos abrir seu carrinho</p>
      <p className="text-[14px] text-mid max-w-[36ch] leading-relaxed mb-6">Verifique sua conexão e tente de novo. Seus itens continuam salvos.</p>
      <button onClick={() => window.location.reload()} className="btn-primary">Tentar de novo</button>
    </div>
  );

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
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <div className="border-b border-mist">
        {/* Mesmo cabeçalho do catálogo: rótulo, título e contagem embaixo */}
        <div className="container-shop py-8 sm:py-12">
          <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-faint mb-3">Seu carrinho</p>
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl leading-tight">Carrinho</h1>
          <p className="text-[12px] text-faint mt-2 font-mono tabular-nums">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</p>
        </div>
      </div>

      {/* Barra frete grátis */}
      {threshold > 0 && (
        <div className="border-b border-mist bg-warm/60">
          <div className="container-shop py-3">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold ${freeShip ? 'text-ink' : 'text-mid'}`}>
                {freeShip
                  ? <span className="flex items-center gap-1">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-clay"><polyline points="20 6 9 17 4 12"/></svg>
                      Frete grátis desbloqueado para este pedido
                    </span>
                  : <><strong className="text-ink">{formatCurrency(remaining)}</strong> para frete grátis</>
                }
              </span>
              <span className="text-xs text-faint tabular-nums font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="h-[3px] bg-mist/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width,background-color] duration-700 ease-out w-[var(--w)] ${freeShip ? 'bg-clay' : 'bg-ink'}`}
                style={{ '--w': `${progress}%` } as React.CSSProperties}
              />
            </div>
          </div>
        </div>
      )}

      <div className="container-shop py-8 pb-24">
        {/* Duas colunas a partir do tablet (antes a lista encolhia e o resumo
            ocupava a largura toda entre 768 e 1023px). */}
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_360px] gap-10 md:gap-8 lg:gap-16 items-start">

          {/* ── Itens ── */}
          <div>
            {itemError && (
              <p role="alert" className="mb-2 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{itemError}</p>
            )}
            <div className="divide-y divide-mist/70">
              {items.map(item => {
                const lineKey = item.note ? `${item.sku}::${item.note}` : item.sku;
                const stepper = (
                    <div className="flex items-center rounded-full border border-mist overflow-hidden">
                    <button
                      onClick={() => updateQty(item.sku, item.quantity - 1, item.note)}
                      className="w-9 h-9 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors"
                      aria-label="Diminuir"
                    >
                      <svg width="12" height="2" viewBox="0 0 12 2" fill="currentColor"><rect width="12" height="2" rx="1"/></svg>
                    </button>
                    <span className="w-9 text-center text-sm font-semibold text-ink tabular-nums">{item.quantity}</span>
                    <button
                      onClick={() => { const avail = stockMap[item.sku] ?? 99; if (item.quantity < avail) updateQty(item.sku, item.quantity + 1, item.note); }}
                      disabled={(stockMap[item.sku] ?? 99) <= item.quantity}
                      className="w-9 h-9 flex items-center justify-center text-mid hover:text-ink hover:bg-warm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Aumentar"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 0a1 1 0 011 1v4h4a1 1 0 110 2H7v4a1 1 0 11-2 0V7H1a1 1 0 010-2h4V1a1 1 0 011-1z"/></svg>
                    </button>
                  </div>
                );
                return (
                <div
                  key={lineKey}
                  className={`relative flex gap-4 sm:gap-5 py-6 transition-opacity ${removing === lineKey ? 'opacity-40 pointer-events-none' : ''}`}
                >
                  {/* Imagem */}
                  <Link href={`/produtos/${item.productId}`} className="relative shrink-0 w-20 h-24 sm:w-24 sm:h-28 rounded-xl bg-warm overflow-hidden border border-mist/60 block">
                    {item.image
                      ? <Image src={item.image} alt={item.productName} fill sizes="96px" className="object-cover hover:scale-105 transition-transform duration-300" />
                      : <div className="h-full flex items-center justify-center"><span className="font-display text-2xl text-faint/30">M</span></div>
                    }
                  </Link>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <Link href={`/produtos/${item.productId}`} className="text-sm font-semibold text-ink leading-snug hover:text-clay transition-colors line-clamp-2 pr-9 sm:pr-0">
                      {item.productName}
                    </Link>
                    {(item.variant?.size || item.variant?.fabric || item.variant?.colorName || item.variant?.color) && (
                      <p className="text-xs text-faint">
                        {[SIZE_LABEL[item.variant.size] ?? item.variant.size, item.variant.fabric, item.variant.colorName || item.variant.color].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {item.note && (
                      <p className="text-xs text-clay font-medium">{item.note}</p>
                    )}
                    {(() => {
                      if (activeMap[item.productId] === false) {
                        return <p className="text-xs text-red-500 font-semibold">Produto não está mais disponível, remova do carrinho</p>;
                      }
                      const avail = stockMap[item.sku];
                      if (avail === 0) return <p className="text-xs text-red-500 font-semibold">Fora de estoque, remova do carrinho</p>;
                      if (avail !== undefined && avail < item.quantity) {
                        return <p className="text-xs text-red-500 font-semibold">Só {avail} disponíve{avail === 1 ? 'l' : 'is'}, diminua a quantidade</p>;
                      }
                      const urgency = avail !== undefined ? getStockUrgency(avail) : null;
                      if (urgency) {
                        return (
                          <p className={`flex items-center gap-1.5 text-[12px] font-medium ${urgency.level === 'critical' ? 'text-clay' : 'text-mid'}`}>
                            <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${urgency.level === 'critical' ? 'bg-clay' : 'bg-amber-400'}`} />
                            {urgency.text}
                          </p>
                        );
                      }
                      return null;
                    })()}
                    {/* Total da linha em destaque; preço unitário embaixo quando
                        há mais de uma peça (antes só o unitário, e com 2 peças
                        a conta não fechava com o subtotal). */}
                    <div className="mt-auto pt-1 flex items-end justify-between gap-3">
                      <div>
                        <p className="font-display text-[1.15rem] text-ink leading-none tabular-nums">{formatCurrency(item.unitPrice * item.quantity)}</p>
                        {item.quantity > 1 && (
                          <p className="text-[11px] text-faint mt-1 tabular-nums">{item.quantity} × {formatCurrency(item.unitPrice)}</p>
                        )}
                      </div>
                      {/* Celular: quantidade ao lado do preço, liberando a largura do nome */}
                      <div className="sm:hidden">{stepper}</div>
                    </div>
                  </div>

                  {/* Qtd + remove */}
                  <button
                    onClick={() => removeItem(item.sku, item.note)}
                    aria-label={`Remover ${item.productName}`}
                    className="sm:hidden absolute top-5 right-0 w-8 h-8 rounded-full flex items-center justify-center text-faint hover:text-red-500 hover:bg-warm transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                  <div className="hidden sm:flex flex-col items-end justify-between shrink-0">
                    <button
                      onClick={() => removeItem(item.sku, item.note)}
                      className="text-xs text-faint hover:text-red-500 transition-colors font-medium"
                    >
                      Remover
                    </button>
                    {stepper}
                  </div>
                </div>
              );})}
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
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-2xl">
                  <div className="flex items-center gap-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                    <div>
                      <span className="text-xs font-bold tracking-[0.1em] text-emerald-800">{couponApplied.code}</span>
                      <span className="text-xs text-emerald-600 ml-2">{formatCurrency(couponApplied.discount)} de desconto</span>
                    </div>
                  </div>
                  <button onClick={() => { removeCoupon(); setCouponOpen(false); }} className="text-xs text-mid hover:text-red-600 font-medium py-2 -my-2 px-2 -mx-2 rounded-full transition-colors">Remover</button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <input
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value)}
                      placeholder="Código do cupom"
                      aria-label="Código do cupom"
                      className="input flex-1 text-sm uppercase placeholder:normal-case placeholder:text-faint"
                      onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                      autoFocus
                    />
                    <button
                      onClick={applyCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      className="min-w-[84px] inline-flex items-center justify-center px-4 py-2.5 rounded-full bg-ink text-paper text-xs font-bold tracking-[0.08em] uppercase disabled:opacity-50 disabled:pointer-events-none hover:bg-clay active:scale-[0.97] transition-[background-color,transform] duration-150"
                    >
                      {couponLoading ? <span className="spinner-sm" /> : 'Aplicar'}
                    </button>
                    <button type="button" aria-label="Fechar cupom" onClick={() => { setCouponOpen(false); setCouponError(''); }} className="text-faint hover:text-ink transition-colors px-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  {couponError && <p role="alert" className="text-xs text-red-500">{couponError}</p>}
                </div>
              )}
              {!couponOpen && couponError && <p role="alert" className="text-xs text-red-500 mt-2">{couponError}</p>}
            </div>
          </div>

          {/* ── Resumo, sticky ── */}
          <div className="w-full lg:sticky lg:top-6">
            <div className="rounded-2xl overflow-hidden border border-mist bg-warm/30">
              <div className="px-5 py-4 border-b border-mist">
                <h2 className="font-sans text-xs font-bold tracking-[0.2em] uppercase text-faint">Resumo do pedido</h2>
              </div>

              <div className="px-5 py-4 flex flex-col gap-3">
                <div className="flex justify-between text-sm text-mid">
                  <span>Subtotal ({totalItems} {totalItems === 1 ? 'item' : 'itens'})</span>
                  <span className="text-ink font-medium">{formatCurrency(subtotal)}</span>
                </div>

                {couponApplied && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Desconto ({couponApplied.code})</span>
                    <span className="font-semibold">−{formatCurrency(couponApplied.discount)}</span>
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
                {hasUnavailableItem ? (
                  <div
                    className="flex items-center justify-center w-full h-14 bg-mist text-faint text-sm font-semibold tracking-[0.05em] cursor-not-allowed"
                    title="Remova os itens indisponíveis pra continuar"
                  >
                    Remova os itens indisponíveis
                  </div>
                ) : (
                  <Link
                    href="/checkout"
                    className="flex items-center justify-center w-full h-14 rounded-full bg-ink text-paper text-sm font-semibold tracking-[0.05em] hover:bg-clay transition-colors duration-200 active:scale-[0.99]"
                  >
                    Finalizar compra
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="ml-2 opacity-60">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </Link>
                )}
              </div>
            </div>

            {/* Selos mini */}
            <div className="mt-4 flex flex-col gap-2 px-1">
              {[
                'Troca em até 7 dias após o recebimento',
              ].map((text) => (
                <div key={text} className="flex items-center gap-2.5 text-xs text-faint">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-mid"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/></svg>
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
