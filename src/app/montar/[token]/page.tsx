'use client';
import Image from 'next/image';
import { use, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { formatCurrency } from '@/lib/utils/format';
import { variantLabel } from '@/lib/variantLabel';
import { lineKey } from '@/lib/sharedCart';
import type { Cart, Product } from '@/types';
import { ProductSheet } from '@/components/cart/ProductSheet';

type Status = 'loading' | 'ok' | 'off';

export default function MontarJuntoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [status, setStatus] = useState<Status>('loading');
  const [cart, setCart] = useState<Cart | null>(null);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [name, setName] = useState(() => {
    try { return typeof window === 'undefined' ? '' : localStorage.getItem('mikma:montar-nome') ?? ''; } catch { return ''; }
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState<Product | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'products'), where('active', '==', true)))
      .then(s => setCatalog(s.docs.map(d => ({ id: d.id, ...d.data() }) as Product)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    getDoc(doc(db, 'sharedCarts', token)).then(link => {
      const uid = link.data()?.uid;
      if (!uid) { setStatus('off'); return; }
      unsub = onSnapshot(doc(db, 'carts', uid), snap => {
        const c = snap.data() as Cart | undefined;
        if (!c || c.share?.token !== token) { setStatus('off'); return; }
        setCart(c);
        setStatus('ok');
      }, () => setStatus('off'));
    }).catch(() => setStatus('off'));
    return () => unsub?.();
  }, [token]);

  const byId = useMemo(() => new Map(catalog.map(p => [p.id, p])), [catalog]);
  const fronhas = useMemo(() => catalog.filter(p => p.category === 'Fronhas'), [catalog]);
  const items = cart?.items ?? [];
  const total = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);

  /** true quando salvou; senão a mensagem de erro. */
  async function post(change: object): Promise<true | string> {
    try {
      const res = await fetch(`/api/cart/shared/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: name.trim() || undefined, change }),
      });
      if (res.ok) return true;
      return (await res.json().catch(() => ({}))).error ?? 'Não deu para salvar. Tente de novo.';
    } catch { return 'Sem conexão. Tente de novo.'; }
  }

  async function send(key: string, change: object) {
    setBusy(key); setError('');
    const r = await post(change);
    if (r !== true) setError(r);
    setBusy(null);
  }

  function saveName(v: string) {
    setName(v);
    try { localStorage.setItem('mikma:montar-nome', v); } catch { /* sem storage */ }
  }

  const brand = (
    <div className="border-b border-mist">
      <div className="container-shop py-4 flex items-center gap-3">
        <Image src="/logo-clay.png" alt="Mikma Lençóis" width={88} height={32} className="h-8 w-auto" priority />
      </div>
    </div>
  );

  if (status === 'loading') return <>{brand}<p className="container-shop py-16 text-sm text-mid" role="status">Abrindo o carrinho…</p></>;
  if (status === 'off') return (
    <>{brand}
      <div className="container-shop py-20 text-center">
        <h1 className="font-display text-3xl text-ink mb-3">Esse link não está mais ativo</h1>
        <p className="text-sm text-mid max-w-[36ch] mx-auto">Quem compartilhou desligou o link ou ele expirou. Peça um novo para continuar montando o pedido.</p>
      </div>
    </>
  );

  return (
    <>{brand}
      <div className="container-shop py-8 pb-24 grid gap-10 md:grid-cols-[minmax(0,1fr)_340px] items-start">
        <section aria-labelledby="montar-titulo">
          <p className="font-semibold text-[10px] tracking-[0.24em] uppercase text-faint mb-3">Montando junto</p>
          <h1 id="montar-titulo" className="font-display text-4xl text-ink mb-2">Carrinho compartilhado</h1>
          <p className="text-[13px] text-mid mb-6 max-w-[48ch]">O que você muda aqui aparece na hora para quem compartilhou. Só essa pessoa finaliza a compra.</p>

          <label className="block text-[12px] font-semibold text-mid mb-6 max-w-xs">
            Seu nome <span className="font-normal text-faint">(aparece para quem compartilhou)</span>
            <input value={name} onChange={e => saveName(e.target.value.slice(0, 24))} maxLength={24} autoComplete="given-name"
              className="mt-1.5 w-full h-11 rounded-full border border-mist bg-paper px-4 text-sm text-ink" />
          </label>

          {error && <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}

          {items.length === 0 && <p className="text-sm text-mid py-6">O carrinho está vazio. Escolha produtos abaixo.</p>}
          <ul className="divide-y divide-mist/70">
            {items.map(item => {
              const key = lineKey(item);
              const product = byId.get(item.productId);
              const isJogo = product?.category === 'Jogos de cama';
              return (
                <li key={key} className="py-5 flex gap-4">
                  <button type="button" onClick={() => product && setPicking(product)} disabled={!product} tabIndex={-1} aria-hidden="true"
                    className="relative w-20 h-24 shrink-0 rounded-xl overflow-hidden bg-warm">
                    {item.image && <Image src={item.image} alt="" fill sizes="80px" className="object-cover" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    {product
                      ? <button type="button" onClick={() => setPicking(product)} className="text-left text-[15px] font-semibold text-ink underline-offset-4 hover:underline">{item.productName}</button>
                      : <p className="text-[15px] font-semibold text-ink">{item.productName}</p>}
                    <p className="text-[12px] text-faint mt-0.5">{variantLabel(item.variant)}</p>
                    {item.note && <p className="text-[12px] text-clay mt-0.5">{item.note}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="flex items-center rounded-full border border-mist">
                        <button type="button" disabled={!!busy} onClick={() => send(key, { op: 'qty', line: key, quantity: item.quantity - 1 })}
                          aria-label={item.quantity === 1 ? `Tirar ${item.productName}` : `Diminuir ${item.productName}`}
                          className="w-11 h-11 text-mid hover:text-ink disabled:opacity-40">−</button>
                        <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">{item.quantity}</span>
                        <button type="button" disabled={!!busy} onClick={() => send(key, { op: 'qty', line: key, quantity: item.quantity + 1 })}
                          aria-label={`Aumentar ${item.productName}`}
                          className="w-11 h-11 text-mid hover:text-ink disabled:opacity-40">+</button>
                      </div>
                      <span className="text-sm font-semibold text-ink tabular-nums">{formatCurrency(item.unitPrice * item.quantity)}</span>
                    </div>
                    {isJogo && fronhas.length > 0 && (
                      <label className="mt-3 block text-[12px] text-mid">
                        Fronha
                        <select value={item.swapSku ?? ''} disabled={!!busy}
                          onChange={e => send(key, { op: 'swap', line: key, swapSku: e.target.value || null })}
                          className="mt-1 block w-full max-w-xs h-11 rounded-full border border-mist bg-paper px-4 text-sm text-ink">
                          <option value="">A que vem no jogo</option>
                          {fronhas.flatMap(f => f.variants.map(v => (
                            <option key={`${f.id}_${v.id}`} value={`${f.id}_${v.id}`}>{f.name} · {variantLabel({ color: v.color, colorName: v.colorName })}</option>
                          )))}
                        </select>
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <h2 className="font-display text-2xl text-ink mt-12 mb-4">Adicionar produtos</h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {catalog.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => setPicking(p)} aria-haspopup="dialog"
                  className="w-full text-left rounded-2xl border border-mist overflow-hidden hover:border-ink transition-colors">
                  <span className="relative block aspect-[4/5] bg-warm">
                    {p.images?.[0] && <Image src={p.images[0]} alt="" fill sizes="(min-width: 640px) 200px, 45vw" className="object-cover" />}
                  </span>
                  <span className="block p-3">
                    <span className="block text-[13px] font-semibold text-ink leading-snug">{p.name}</span>
                    <span className="block text-[12px] text-mid mt-0.5">{formatCurrency(p.price)}</span>
                    <span className="block text-[11px] text-clay font-semibold mt-1.5">Ver detalhes</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <aside className="md:sticky md:top-6 rounded-3xl border border-mist p-6">
          <p className="text-[12px] text-mid">{items.reduce((a, i) => a + i.quantity, 0)} itens</p>
          <p className="mt-1 flex items-baseline justify-between">
            <span className="text-sm text-mid">Subtotal</span>
            <span className="font-display text-3xl text-ink tabular-nums">{formatCurrency(total)}</span>
          </p>
          <p className="mt-3 text-[12px] text-faint leading-relaxed">Frete e pagamento ficam com quem compartilhou o carrinho.</p>
        </aside>
      </div>
      {picking && (
        <ProductSheet product={picking} onClose={() => setPicking(null)}
          onAdd={variantId => post({ op: 'add', productId: picking.id, variantId })} />
      )}
    </>
  );
}
