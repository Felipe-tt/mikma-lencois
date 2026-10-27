'use client';
import Image from 'next/image';
import { use, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { formatCurrency } from '@/lib/utils/format';
import { variantLabel } from '@/lib/variantLabel';
import { lineKey, VIEWER_TTL_MS } from '@/lib/sharedCart';
import type { Cart, CartItem, Product } from '@/types';
import { ProductSheet } from '@/components/cart/ProductSheet';
import { Avatar, ChatBox, LikeButton, OnlineStack, useTabBadge } from '@/components/cart/montarUi';

type Status = 'loading' | 'ok' | 'off';

const NAME_KEY = 'mikma:montar-nome';
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function readStorage(key: string) {
  try { return typeof window === 'undefined' ? '' : localStorage.getItem(key) ?? ''; } catch { return ''; }
}

/** Id aleatório deste navegador, pra aparecer uma vez só na lista de online. */
function viewerId() {
  let id = readStorage('mikma:montar-id');
  if (!/^[A-Za-z0-9]{8,24}$/.test(id)) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join('');
    try { localStorage.setItem('mikma:montar-id', id); } catch { /* sem storage */ }
  }
  return id;
}

export default function MontarJuntoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [status, setStatus] = useState<Status>('loading');
  const [cart, setCart] = useState<Cart | null>(null);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [name, setName] = useState(() => readStorage(NAME_KEY));
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [threshold, setThreshold] = useState(0);
  // Produto que acabou de entrar pelo + do card (mostra o ✓ por um instante).
  const [justAdded, setJustAdded] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(null), 1500);
    return () => clearTimeout(t);
  }, [justAdded]);
  const [removed, setRemoved] = useState<CartItem | null>(null);
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 6000);
    return () => clearTimeout(t);
  }, [removed]);
  const [openedAt] = useState(() => Date.now());
  // Este navegador, pra não aparecer na própria lista de online.
  const [me] = useState(() => (typeof window === 'undefined' ? '' : viewerId()));
  const [now, setNow] = useState(openedAt);
  const [hiddenAt, setHiddenAt] = useState(0);

  useEffect(() => {
    getDocs(query(collection(db, 'products'), where('active', '==', true)))
      .then(s => setCatalog(s.docs.map(d => ({ id: d.id, ...d.data() }) as Product)))
      .catch(() => {});
    fetch('/api/settings/public').then(r => r.json())
      .then(d => setThreshold(Math.max(0, Number(d.freeShippingThresholdCents) || 0))).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
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

  /** true quando salvou; senão a mensagem de erro. */
  async function post(change: object): Promise<true | string> {
    try {
      const res = await fetch(`/api/cart/shared/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: name.trim() || undefined, viewer: viewerId(), change }),
      });
      if (res.ok) return true;
      return (await res.json().catch(() => ({}))).error ?? 'Não deu para salvar. Tente de novo.';
    } catch { return 'Sem conexão. Tente de novo.'; }
  }

  // "Estou aqui": entra na lista de online e renova enquanto a aba está aberta.
  const live = status === 'ok' && !!name && !cart?.share?.paidAt;
  useEffect(() => {
    if (!live) return;
    const ping = () => { if (document.visibilityState === 'visible') post({ op: 'ping' }); };
    ping();
    const t = setInterval(ping, 45_000);
    document.addEventListener('visibilitychange', ping);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ping); };
  }, [live, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const share = cart?.share;
  const log = share?.log ?? [];
  const chat = share?.chat ?? [];
  // Recados não lidos (bolinha da barra do celular): lido = tocou no botão.
  const seenKey = `mikma:montar-lido:${token}`;
  const [seenAt, setSeenAt] = useState(() => Number(readStorage(seenKey)) || 0);
  const unread = chat.filter(m => m.at > seenAt && m.by !== name).length;
  function markSeen() {
    const at = Date.now();
    setSeenAt(at);
    try { localStorage.setItem(seenKey, String(at)); } catch { /* sem storage */ }
  }
  const lastLog = log[log.length - 1];
  const lastMsg = chat[chat.length - 1];
  // O aviso mostra a novidade mais recente: mudança no carrinho ou recado.
  const latest = lastMsg && (!lastLog || lastMsg.at > lastLog.at)
    ? { ...lastMsg, text: `disse: “${lastMsg.text.length > 60 ? lastMsg.text.slice(0, 60) + '…' : lastMsg.text}”` }
    : lastLog;
  // Aviso quando outra pessoa mexe (some sozinho).
  const toast = latest && latest.at > openedAt && latest.at !== hiddenAt && latest.by !== (name.trim() || 'Alguém') ? latest : null;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setHiddenAt(toast.at), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // Estoque dos itens do carrinho, pra avisar "só restam 2" e travar o +.
  const [stock, setStock] = useState<Record<string, number>>({});
  const skuKey = (cart?.items ?? []).map(i => i.sku).sort().join(',');
  useEffect(() => {
    if (!skuKey) return;
    fetch(`/api/stock?skus=${encodeURIComponent(skuKey)}`).then(r => (r.ok ? r.json() : {})).then(setStock).catch(() => {});
  }, [skuKey]);

  const byId = useMemo(() => new Map(catalog.map(p => [p.id, p])), [catalog]);
  const fronhas = useMemo(() => catalog.filter(p => p.category === 'Fronhas'), [catalog]);
  const categories = useMemo(() => [...new Set(catalog.map(p => p.category))], [catalog]);
  const shown = useMemo(() => catalog.filter(p =>
    (!category || p.category === category) && (!search.trim() || fold(p.name).includes(fold(search.trim())))), [catalog, category, search]);

  const items = cart?.items ?? [];
  const total = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);
  const count = items.reduce((a, i) => a + i.quantity, 0);
  const inCart = new Map<string, number>();
  items.forEach(i => inCart.set(i.productId, (inCart.get(i.productId) ?? 0) + i.quantity));
  const online = Object.entries(share?.viewers ?? {})
    .filter(([id, v]) => now - v.at < VIEWER_TTL_MS && id !== me)
    .map(([, v]) => v)
    .sort((a, b) => Number(!!b.owner) - Number(!!a.owner));
  const owner = share?.ownerName;
  // Título da aba com o nome do dono. Reaplicado a cada troca de tela: o
  // Next devolve o título do layout quando a página muda de estado.
  useEffect(() => {
    if (owner) document.title = `Carrinho de ${owner} · Montar junto`;
  }, [owner, name, status]);
  useTabBadge([...log, ...chat], name.trim() || 'Alguém');
  const remaining = Math.max(0, threshold - total);
  const progress = threshold > 0 ? Math.min(100, (total / threshold) * 100) : 0;

  async function send(key: string, change: object) {
    setBusy(key); setError('');
    const r = await post(change);
    if (r !== true) setError(r);
    setBusy(null);
    return r === true;
  }

  // Item tirado por engano: volta com a mesma quantidade e fronha.
  async function undoRemove() {
    const item = removed;
    if (!item) return;
    setRemoved(null);
    const steps: object[] = [{ op: 'add', productId: item.productId, variantId: item.variant.id }];
    if (item.quantity > 1) steps.push({ op: 'qty', line: item.sku, quantity: item.quantity });
    if (item.swapSku) steps.push({ op: 'swap', line: item.sku, swapSku: item.swapSku });
    for (const step of steps) {
      const r = await post(step);
      if (r !== true) { setError(r); return; }
    }
  }

  function saveName(v: string) {
    const clean = v.trim().slice(0, 24);
    if (!clean) return;
    setName(clean);
    try { localStorage.setItem(NAME_KEY, clean); } catch { /* sem storage */ }
  }

  const header = (<>
    <header className="sticky top-0 z-30 border-b border-mist bg-paper/90 backdrop-blur">
      <div className="container-shop h-16 flex items-center justify-between gap-3">
        <Image src="/logo-clay.png" alt="Mikma Lençóis" width={88} height={32} className="h-8 w-auto" priority />
        {live && (
          <div className="flex items-center gap-3">
            <OnlineStack people={online} />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warm px-2.5 py-1 text-[11px] font-semibold text-mid">
              <span className="relative flex h-2 w-2"><span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span>
              Ao vivo
            </span>
          </div>
        )}
      </div>
    </header>
  </>);

  if (status === 'loading') return <>{header}<p className="container-shop py-16 text-sm text-mid" role="status">Abrindo o carrinho…</p></>;
  if (status === 'off') return (
    <>{header}
      <div className="container-shop py-20 text-center">
        <h1 className="font-display text-3xl text-ink mb-3">Esse link não está mais ativo</h1>
        <p className="text-sm text-mid max-w-[36ch] mx-auto">Quem compartilhou desligou o link ou ele expirou. Peça um novo para continuar montando o pedido.</p>
      </div>
    </>
  );

  // Pedido pago: o link fica só com a confirmação.
  if (share?.paidAt) return (
    <>{header}
      <div className="container-shop min-h-[calc(100dvh-4rem)] flex items-center justify-center py-12">
        <div className="w-full max-w-sm text-center animate-fade-up">
          <span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-clay text-paper">
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
          <h1 className="font-display text-3xl sm:text-4xl text-ink leading-tight">{owner ?? 'Quem compartilhou'} finalizou o pedido</h1>
          <p className="mt-3 text-[14px] text-mid leading-relaxed">
            {share.paidItems ? `${share.paidItems} ${share.paidItems === 1 ? 'item' : 'itens'} montados juntos. ` : ''}Obrigado por ajudar a escolher. Agora é com a gente: o pedido já está sendo preparado.
          </p>
          <ul className="mt-6 flex justify-center -space-x-2" aria-label="Quem montou">
            {[...new Set((share.log ?? []).map(e => e.by))].slice(0, 6).map(n => <li key={n}><Avatar name={n} size={32} /></li>)}
          </ul>
        </div>
      </div>
    </>
  );

  // Porta de entrada: antes de ver o carrinho, a pessoa diz o nome. Tudo
  // que ela fizer nesta sessão (histórico, "por Ana", online) usa esse nome.
  if (!name) return (
    <>{header}
      <div className="container-shop min-h-[calc(100dvh-4rem)] flex items-center justify-center py-12">
        <form onSubmit={e => { e.preventDefault(); saveName(nameDraft); }} className="w-full max-w-sm text-center animate-fade-up">
          {/* Prévia do que já está no carrinho, com quem chamou na frente. */}
          <div className="mb-6 flex items-center justify-center">
            {owner && <span className="relative z-10"><Avatar name={owner} size={56} /></span>}
            {items.filter(i => i.image).slice(0, 3).map((i, n) => (
              <span key={lineKey(i)} className="relative -ml-3 h-14 w-14 overflow-hidden rounded-2xl bg-warm ring-2 ring-paper" style={{ zIndex: 9 - n, transform: `rotate(${(n - 1) * 6}deg)` }}>
                <Image src={i.image} alt="" fill sizes="56px" className="object-cover" />
              </span>
            ))}
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-ink leading-tight">
            {owner ? `${owner} te chamou pra montar o pedido junto` : 'Bora montar o pedido junto'}
          </h1>
          <p className="mt-3 text-[14px] text-mid leading-relaxed">
            {count > 0 ? `Já tem ${count} ${count === 1 ? 'item' : 'itens'} no carrinho. ` : ''}O que você escolher aparece na hora para {owner ?? 'quem compartilhou'}.
          </p>
          <label htmlFor="montar-nome" className="sr-only">Seu nome</label>
          <input id="montar-nome" value={nameDraft} onChange={e => setNameDraft(e.target.value)} maxLength={24}
            autoComplete="given-name" autoFocus placeholder="Seu nome" enterKeyHint="go"
            className="mt-8 w-full h-13 min-h-12 rounded-full border border-mist bg-paper px-5 text-center text-[16px] text-ink focus:border-ink outline-none" />
          <button type="submit" disabled={!nameDraft.trim()}
            className="mt-3 w-full h-12 rounded-full bg-ink text-paper text-sm font-semibold hover:bg-clay transition-colors disabled:opacity-40">
            Entrar no carrinho
          </button>
          <p className="mt-4 text-[12px] text-faint">Seu nome aparece para quem está montando junto.</p>
        </form>
      </div>
    </>
  );

  return (
    <>{header}
      {toast && (
        <div role="status" className="fixed z-40 left-1/2 -translate-x-1/2 top-20 w-[calc(100%-2rem)] max-w-sm flex items-center gap-3 rounded-full bg-ink text-paper pl-2 pr-5 py-2 shadow-lg animate-fade-up">
          <Avatar name={toast.by} size={28} ring={false} />
          <span className="text-[13px] leading-snug"><strong>{toast.by}</strong> {toast.text}</span>
        </div>
      )}

      <div className="container-shop py-8 pb-32 md:pb-16 grid gap-10 md:gap-x-10 md:gap-y-12 md:grid-rows-[auto_1fr] md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="min-w-0 md:col-start-1 md:row-start-1">
          <p className="font-semibold text-[10px] tracking-[0.24em] uppercase text-faint mb-3">Montando junto</p>
          <h1 className="font-display text-4xl sm:text-5xl text-ink leading-tight mb-2">{owner ? `Carrinho de ${owner}` : 'Carrinho compartilhado'}</h1>
          <p className="text-[14px] text-mid mb-6 max-w-[52ch] leading-relaxed">
            Tudo que você muda aqui aparece na hora para {owner ?? 'quem compartilhou'}. Escolham juntos; o pagamento fica com {owner ?? 'essa pessoa'}.
          </p>

          <section id="montar-itens" aria-labelledby="montar-itens-titulo" className="scroll-mt-20">
            <h2 id="montar-itens-titulo" className="flex items-baseline gap-2 font-display text-2xl text-ink mb-1">
              No carrinho <span className="font-sans text-[13px] text-faint tabular-nums">{count} {count === 1 ? 'item' : 'itens'}</span>
            </h2>
            {items.length === 0 && (
              <div className="my-4 rounded-3xl border border-dashed border-mist px-6 py-10 text-center">
                <p className="font-display text-xl text-ink">Ainda vazio</p>
                <p className="text-[13px] text-mid mt-1">Escolha os produtos aqui embaixo para começar.</p>
              </div>
            )}
            <ul className="divide-y divide-mist/70">
              {items.map(item => {
                const key = lineKey(item);
                const product = byId.get(item.productId);
                const isJogo = product?.category === 'Jogos de cama';
                const by = share?.addedBy?.[item.sku];
                const left = stock[item.sku];
                const gone = (product === undefined && catalog.length > 0) || left === 0;
                return (
                  <li key={key} className="py-5 flex gap-4 animate-fade-up">
                    <button type="button" onClick={() => product && setPicking(product)} disabled={!product} tabIndex={-1} aria-hidden="true"
                      className="relative w-20 h-24 sm:w-24 sm:h-28 shrink-0 rounded-2xl overflow-hidden bg-warm">
                      {item.image && <Image src={item.image} alt="" fill sizes="96px" className="object-cover" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      {product
                        ? <button type="button" onClick={() => setPicking(product)} className="text-left text-[15px] font-semibold text-ink underline-offset-4 hover:underline">{item.productName}</button>
                        : <p className="text-[15px] font-semibold text-ink">{item.productName}</p>}
                      <p className="text-[12px] text-faint mt-0.5">{variantLabel(item.variant)}</p>
                      {item.note && <p className="text-[12px] text-clay mt-0.5">{item.note}</p>}
                      {gone
                        ? <p className="text-[12px] font-semibold text-red-700 mt-1">Esgotado: tire do carrinho ou troque por outro</p>
                        : left !== undefined && left <= 3 && <p className="text-[12px] font-semibold text-amber-700 mt-1">Só restam {left}</p>}
                      {by && (
                        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-mid">
                          <Avatar name={by} size={16} ring={false} /> por {by}
                        </p>
                      )}
                      <div className="mt-1 -ml-2">
                        <LikeButton names={share?.likes?.[item.sku] ?? []} me={name} onToggle={() => send(`like:${item.sku}`, { op: 'like', sku: item.sku })} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <div className="flex items-center rounded-full border border-mist">
                          <button type="button" disabled={busy === key} onClick={async () => {
                            const ok = await send(key, { op: 'qty', line: key, quantity: item.quantity - 1 });
                            if (ok && item.quantity === 1) setRemoved(item);
                          }}
                            aria-label={item.quantity === 1 ? `Tirar ${item.productName}` : `Diminuir ${item.productName}`}
                            className="w-11 h-11 text-mid hover:text-ink disabled:opacity-40">{item.quantity === 1 ? '×' : '−'}</button>
                          <span key={item.quantity} className="w-8 text-center text-sm tabular-nums animate-badge-bump" aria-live="polite">{item.quantity}</span>
                          <button type="button" disabled={busy === key || (left !== undefined && item.quantity >= left)} onClick={() => send(key, { op: 'qty', line: key, quantity: item.quantity + 1 })}
                            aria-label={`Aumentar ${item.productName}`}
                            className="w-11 h-11 text-mid hover:text-ink disabled:opacity-40">+</button>
                        </div>
                        <span className="text-sm font-semibold text-ink tabular-nums">{formatCurrency(item.unitPrice * item.quantity)}</span>
                      </div>
                      {isJogo && fronhas.length > 0 && (
                        <label className="mt-3 block text-[12px] text-mid">
                          Fronha
                          <select value={item.swapSku ?? ''} disabled={busy === key}
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
          </section>
        </div>

        <aside className="min-w-0 md:col-start-2 md:row-start-1 md:row-span-2 md:sticky md:top-24 flex flex-col gap-4">
          <div className="rounded-3xl border border-mist p-6">
            <p className="flex items-baseline justify-between">
              <span className="text-sm text-mid">Subtotal · {count} {count === 1 ? 'item' : 'itens'}</span>
              <span className="font-display text-3xl text-ink tabular-nums">{formatCurrency(total)}</span>
            </p>
            {threshold > 0 && (
              <div className="mt-4">
                <p className="text-[12px] text-mid mb-1.5">
                  {remaining === 0 ? 'Frete grátis garantido' : <>Faltam <strong className="text-ink">{formatCurrency(remaining)}</strong> para frete grátis</>}
                </p>
                <div className="h-[3px] bg-mist/60 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-[width] duration-700 w-[var(--w)] ${remaining === 0 ? 'bg-clay' : 'bg-ink'}`} style={{ '--w': `${progress}%` } as React.CSSProperties} />
                </div>
              </div>
            )}
            <p className="mt-4 text-[12px] text-faint leading-relaxed">Frete e pagamento ficam com {owner ?? 'quem compartilhou o carrinho'}.</p>
          </div>
          <div className="rounded-3xl border border-mist p-6">
            <h2 className="text-[13px] font-semibold text-ink mb-4">Recados</h2>
            <ChatBox id="montar-recados" messages={chat} now={now} me={name} onSend={text => post({ op: 'msg', text })} />
          </div>
        </aside>

        <section aria-labelledby="montar-catalogo" className="min-w-0 md:col-start-1 md:row-start-2">
          <h2 id="montar-catalogo" className="font-display text-2xl text-ink mb-4">Adicionar produtos</h2>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto" aria-label="Buscar produto"
            className="w-full h-11 rounded-full border border-mist bg-paper px-4 text-sm text-ink" />
          <div className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Categorias">
            {['', ...categories].map(c => (
              <button key={c || 'tudo'} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}
                className={`shrink-0 h-9 px-4 rounded-full border text-[12px] font-semibold transition-colors ${category === c ? 'border-ink bg-ink text-paper' : 'border-mist text-mid hover:border-ink hover:text-ink'}`}>
                {c || 'Tudo'}
              </button>
            ))}
          </div>
          {catalog.length === 0 && (
            <ul className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4" aria-hidden="true">
              {[0, 1, 2, 3].map(i => <li key={i} className="aspect-[4/5] rounded-2xl bg-warm animate-pulse" />)}
            </ul>
          )}
          {catalog.length > 0 && shown.length === 0 && <p className="mt-6 text-sm text-mid">Nenhum produto com esse nome.</p>}
          <ul className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {shown.map(p => {
              const n = inCart.get(p.id);
              return (
                <li key={p.id} className="relative">
                  <button type="button" onClick={() => setPicking(p)} aria-haspopup="dialog"
                    className="group w-full text-left rounded-2xl border border-mist overflow-hidden hover:border-ink transition-colors">
                    <span className="relative block aspect-[4/5] bg-warm overflow-hidden">
                      {p.images?.[0] && <Image src={p.images[0]} alt="" fill sizes="(min-width: 640px) 220px, 45vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />}
                      {n && <span className="absolute top-2 left-2 rounded-full bg-ink text-paper text-[11px] font-semibold px-2.5 py-1">No carrinho · {n}</span>}
                    </span>
                    <span className="block p-3 pr-14">
                      <span className="block text-[13px] font-semibold text-ink leading-snug">{p.name}</span>
                      <span className="block mt-1 text-[12px] text-mid">{formatCurrency(p.price)}</span>
                    </span>
                  </button>
                  {/* Uma opção só: o + já coloca no carrinho. Várias: abre a escolha. */}
                  <button type="button" disabled={busy === `quick:${p.id}`}
                    onClick={async () => {
                      if (p.variants.length !== 1) { setPicking(p); return; }
                      if (await send(`quick:${p.id}`, { op: 'add', productId: p.id, variantId: p.variants[0].id })) setJustAdded(p.id);
                    }}
                    aria-label={p.variants.length === 1 ? `Adicionar ${p.name}` : `Escolher opção de ${p.name}`}
                    className={`absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 ${justAdded === p.id ? 'bg-clay text-paper' : 'bg-warm text-ink hover:bg-ink hover:text-paper'}`}>
                    {justAdded === p.id
                      ? <svg key="ok" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="animate-badge-bump"><polyline points="20 6 9 17 4 12" /></svg>
                      : <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* Erros num aviso flutuante: aparecem mesmo rolando o catálogo. */}
      {error && (
        <div role="alert" className="fixed z-50 left-1/2 -translate-x-1/2 top-20 w-[calc(100%-2rem)] max-w-sm flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 text-red-700 pl-4 pr-1.5 py-1.5 shadow-lg animate-fade-up">
          <span className="flex-1 text-[13px] leading-snug">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Fechar aviso" className="shrink-0 w-9 h-9 rounded-full hover:bg-red-100 flex items-center justify-center">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}

      {removed && (
        <div role="status" className="fixed z-40 left-1/2 -translate-x-1/2 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 w-[calc(100%-2rem)] max-w-sm flex items-center gap-3 rounded-full bg-ink text-paper pl-5 pr-1.5 py-1.5 shadow-lg animate-fade-up">
          <span className="flex-1 min-w-0 text-[13px] truncate"><span className="font-semibold">Item removido</span><span className="text-paper/60"> · {removed.productName}</span></span>
          <button type="button" onClick={undoRemove} className="shrink-0 h-10 px-4 rounded-full text-[13px] font-semibold bg-paper/10 hover:bg-paper/20">Desfazer</button>
        </div>
      )}

      {/* Celular: total sempre à vista, com atalho pro carrinho. */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-mist bg-paper/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="container-shop h-16 flex items-center justify-between gap-3">
          <span>
            <span className="block text-[11px] text-faint">{count} {count === 1 ? 'item' : 'itens'}</span>
            <span className="block font-display text-xl text-ink tabular-nums leading-none">{formatCurrency(total)}</span>
          </span>
          <span className="flex items-center gap-2">
            <a href="#montar-recados" onClick={markSeen} className="relative w-11 h-11 rounded-full border border-mist text-ink flex items-center justify-center">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></svg>
              <span className="sr-only">Recados</span>
              {unread > 0 && <span key={unread} className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-clay text-paper text-[10px] font-bold flex items-center justify-center animate-badge-bump">{unread}<span className="sr-only"> novos</span></span>}
            </a>
            <a href="#montar-itens" className="h-11 px-5 rounded-full bg-ink text-paper text-[13px] font-semibold flex items-center">Ver carrinho</a>
          </span>
        </div>
      </div>

      {picking && (
        <ProductSheet product={picking} onClose={() => setPicking(null)}
          onAdd={variantId => post({ op: 'add', productId: picking.id, variantId })} />
      )}
    </>
  );
}
