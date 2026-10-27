'use client';
import Image from 'next/image';
import { use, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { formatCurrency } from '@/lib/utils/format';
import { variantLabel } from '@/lib/variantLabel';
import { lineKey, VIEWER_TTL_MS } from '@/lib/sharedCart';
import type { Cart, CartItem, Product } from '@/types';
import { ProductSheet } from '@/components/cart/ProductSheet';
import { Avatar, ChatBox, LikeButton, OnlineStack, useTabBadge } from '@/components/cart/montarUi';

type Status = 'loading' | 'ok' | 'off';
type Tab = 'produtos' | 'carrinho' | 'recados';

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
  const [tab, setTab] = useState<Tab>('carrinho');
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

  // Dono no checkout: os itens ficam travados até ele voltar ou a trava vencer.
  const locked = !!cart?.share?.lockedUntil && cart.share.lockedUntil > now;
  const lockedMsg = `${cart?.share?.ownerName ?? 'Quem compartilhou'} está finalizando a compra. O carrinho está travado.`;

  /** true quando salvou; senão a mensagem de erro. */
  async function post(change: object): Promise<true | string> {
    const op = (change as { op?: string }).op;
    if (locked && op !== 'msg' && op !== 'like' && op !== 'ping') return lockedMsg;
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
    <header className="shrink-0 border-b border-mist bg-paper">
      <div className="px-4 md:px-6 h-14 flex items-center gap-3">
        <Image src="/logo-clay.png" alt="Mikma Lençóis" width={76} height={28} className="h-7 w-auto shrink-0" priority />
        {live && (
          <>
            <span className="h-6 w-px bg-mist shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint whitespace-nowrap">Montando junto</p>
              <h1 className="font-display text-[17px] text-ink truncate">{owner ? `Carrinho de ${owner}` : 'Carrinho compartilhado'}</h1>
            </div>
            <span className="shrink-0"><OnlineStack people={online} max={2} /></span>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-mid shrink-0">
              <span className="relative flex h-2 w-2"><span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span>
              Ao vivo
            </span>
          </>
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

  const tabBtn = (t: Tab, label: string, badge?: number) => (
    <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); if (t === 'recados') markSeen(); }}
      className={`relative flex-1 h-10 rounded-full text-[13px] font-semibold transition-colors ${tab === t ? 'bg-ink text-paper' : 'text-mid hover:text-ink'}`}>
      {label}
      {!!badge && <span className={`ml-1.5 inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${tab === t ? 'bg-paper/20 text-paper' : 'bg-clay text-paper'}`}>{badge}</span>}
    </button>
  );

  const cartPane = (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-8 py-12">
            <p className="font-display text-xl text-ink">Carrinho vazio</p>
            <p className="mt-1 text-[13px] text-mid">Escolha os produtos e eles aparecem aqui.</p>
            <button type="button" onClick={() => setTab('produtos')} className="md:hidden mt-5 h-11 px-5 rounded-full bg-ink text-paper text-[13px] font-semibold">Escolher produtos</button>
          </div>
        ) : (
          <ul className="divide-y divide-mist/70">
            {items.map(item => {
              const key = lineKey(item);
              const product = byId.get(item.productId);
              const isJogo = product?.category === 'Jogos de cama';
              const by = share?.addedBy?.[item.sku];
              const left = stock[item.sku];
              const gone = (product === undefined && catalog.length > 0) || left === 0;
              return (
                <li key={key} className="px-4 md:px-5 py-3.5 flex gap-3 animate-fade-up">
                  <button type="button" onClick={() => product && setPicking(product)} disabled={!product} tabIndex={-1} aria-hidden="true"
                    className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-warm">
                    {item.image && <Image src={item.image} alt="" fill sizes="64px" className="object-cover" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {product
                          ? <button type="button" onClick={() => setPicking(product)} className="block max-w-full text-left text-[13px] font-semibold text-ink leading-snug line-clamp-2 hover:underline underline-offset-2">{item.productName}</button>
                          : <p className="text-[13px] font-semibold text-ink leading-snug line-clamp-2">{item.productName}</p>}
                        <p className="text-[11px] text-faint mt-0.5 truncate">{variantLabel(item.variant)}{by ? ` · por ${by}` : ''}</p>
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold text-ink tabular-nums">{formatCurrency(item.unitPrice * item.quantity)}</span>
                    </div>
                    {item.note && <p className="text-[11px] text-clay mt-0.5 truncate">{item.note}</p>}
                    {gone
                      ? <p className="text-[11px] font-semibold text-red-700 mt-0.5">Esgotado: tire ou troque por outro</p>
                      : left !== undefined && left <= 3 && <p className="text-[11px] font-semibold text-amber-700 mt-0.5">Só restam {left}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex items-center rounded-full border border-mist bg-paper">
                        <button type="button" disabled={busy === key || locked} onClick={async () => {
                          const ok = await send(key, { op: 'qty', line: key, quantity: item.quantity - 1 });
                          if (ok && item.quantity === 1) setRemoved(item);
                        }}
                          aria-label={item.quantity === 1 ? `Tirar ${item.productName}` : `Diminuir ${item.productName}`}
                          className="w-9 h-9 text-mid hover:text-ink disabled:opacity-40">{item.quantity === 1 ? '×' : '−'}</button>
                        <span key={item.quantity} className="w-6 text-center text-[13px] tabular-nums animate-badge-bump" aria-live="polite">{item.quantity}</span>
                        <button type="button" disabled={busy === key || locked || (left !== undefined && item.quantity >= left)} onClick={() => send(key, { op: 'qty', line: key, quantity: item.quantity + 1 })}
                          aria-label={`Aumentar ${item.productName}`}
                          className="w-9 h-9 text-mid hover:text-ink disabled:opacity-40">+</button>
                      </div>
                      <LikeButton names={share?.likes?.[item.sku] ?? []} me={name} onToggle={() => send(`like:${item.sku}`, { op: 'like', sku: item.sku })} />
                    </div>
                    {isJogo && fronhas.length > 0 && (
                      <label className="mt-2 flex items-center gap-2 text-[11px] text-mid">
                        <span className="shrink-0">Fronha</span>
                        <select value={item.swapSku ?? ''} disabled={busy === key || locked}
                          onChange={e => send(key, { op: 'swap', line: key, swapSku: e.target.value || null })}
                          className="min-w-0 flex-1 h-9 rounded-full border border-mist bg-paper px-3 text-[12px] text-ink">
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
        )}
      </div>
      <div className="shrink-0 border-t border-mist px-4 md:px-5 py-4 bg-paper">
        <p className="flex items-baseline justify-between">
          <span className="text-[13px] text-mid">Subtotal · {count} {count === 1 ? 'item' : 'itens'}</span>
          <span className="font-display text-2xl text-ink tabular-nums">{formatCurrency(total)}</span>
        </p>
        {threshold > 0 && (
          <div className="mt-2.5">
            <div className="h-[3px] bg-mist/60 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-[width] duration-700 w-[var(--w)] ${remaining === 0 ? 'bg-clay' : 'bg-ink'}`} style={{ '--w': `${progress}%` } as React.CSSProperties} />
            </div>
            <p className="mt-1.5 text-[11px] text-mid">
              {remaining === 0 ? 'Frete grátis garantido' : <>Faltam <strong className="text-ink">{formatCurrency(remaining)}</strong> para frete grátis</>}
            </p>
          </div>
        )}
        <p className="mt-2 text-[11px] text-faint">Frete e pagamento ficam com {owner ?? 'quem compartilhou'}.</p>
      </div>
    </>
  );

  const chatPane = (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 py-4 flex flex-col">
      {/* Campo de escrever embaixo, como em qualquer conversa. */}
      <div className="mt-auto">
        <ChatBox id="montar-recados" messages={chat} now={now} me={name} onSend={text => post({ op: 'msg', text })} />
      </div>
    </div>
  );

  const catalogPane = (
    <section aria-label="Produtos" className="min-h-0 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-paper/95 backdrop-blur border-b border-mist px-4 md:px-6 py-3 flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto" aria-label="Buscar produto"
          className="w-full lg:w-64 shrink-0 h-10 rounded-full border border-mist bg-paper px-4 text-[13px] text-ink" />
        <div className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Categorias">
          {['', ...categories].map(c => (
            <button key={c || 'tudo'} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}
              className={`shrink-0 h-8 px-3.5 rounded-full border text-[12px] font-semibold transition-colors ${category === c ? 'border-ink bg-ink text-paper' : 'border-mist text-mid hover:border-ink hover:text-ink'}`}>
              {c || 'Tudo'}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 md:p-6">
        {catalog.length > 0 && shown.length === 0 && <p className="text-sm text-mid">Nenhum produto com esse nome.</p>}
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
          {catalog.length === 0 && [0, 1, 2, 3, 4, 5, 6, 7].map(i => <li key={i} aria-hidden="true" className="aspect-[3/4] rounded-xl bg-warm animate-pulse" />)}
          {shown.map(p => {
            const n = inCart.get(p.id);
            return (
              <li key={p.id} className="relative">
                <button type="button" onClick={() => setPicking(p)} aria-haspopup="dialog" className="group w-full text-left">
                  <span className="relative block aspect-square rounded-xl bg-warm overflow-hidden">
                    {p.images?.[0] && <Image src={p.images[0]} alt="" fill sizes="(min-width: 1536px) 15vw, (min-width: 1024px) 18vw, (min-width: 640px) 30vw, 45vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />}
                    {n && <span className="absolute top-2 left-2 rounded-full bg-ink/90 text-paper text-[10px] font-bold px-2 py-0.5 tabular-nums">{n} no carrinho</span>}
                  </span>
                  <span className="block pt-2 pr-1">
                    <span className="block text-[12.5px] font-semibold text-ink leading-snug line-clamp-2">{p.name}</span>
                    <span className="block mt-0.5 text-[12px] text-mid tabular-nums">{formatCurrency(p.price)}</span>
                  </span>
                </button>
                {/* Uma opção só: o + já coloca no carrinho. Várias: abre a escolha. */}
                <button type="button" disabled={busy === `quick:${p.id}` || locked}
                  onClick={async () => {
                    if (p.variants.length !== 1) { setPicking(p); return; }
                    if (await send(`quick:${p.id}`, { op: 'add', productId: p.id, variantId: p.variants[0].id })) setJustAdded(p.id);
                  }}
                  aria-label={p.variants.length === 1 ? `Adicionar ${p.name}` : `Escolher opção de ${p.name}`}
                  className={`absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition-colors disabled:opacity-50 ${justAdded === p.id ? 'bg-clay text-paper' : 'bg-paper/95 text-ink hover:bg-ink hover:text-paper'}`}>
                  {justAdded === p.id
                    ? <svg key="ok" aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="animate-badge-bump"><polyline points="20 6 9 17 4 12" /></svg>
                    : <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {header}
      {locked && (
        <div role="status" className="shrink-0 border-b border-amber-300/60 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="px-4 md:px-6 py-2.5 text-[12.5px] font-semibold flex items-center gap-2">
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
            {lockedMsg} Os recados continuam abertos.
          </p>
        </div>
      )}
      {/* Celular: uma coisa de cada vez, em abas. */}
      <div role="tablist" aria-label="Montar junto" className="md:hidden shrink-0 flex gap-1 p-1.5 mx-3 my-2 rounded-full bg-warm">
        {tabBtn('produtos', 'Produtos')}
        {tabBtn('carrinho', 'Carrinho', count)}
        {tabBtn('recados', 'Recados', unread)}
      </div>

      <div className="flex-1 min-h-0 md:grid md:grid-cols-[minmax(0,1fr)_360px] lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className={`${tab === 'produtos' ? 'flex' : 'hidden'} md:flex flex-col h-full min-h-0`}>{catalogPane}</div>
        <aside aria-label={tab === 'recados' ? 'Recados' : 'Carrinho'} className={`${tab === 'produtos' ? 'hidden' : 'flex'} md:flex flex-col h-full min-h-0 md:border-l border-mist md:bg-warm/20`}>
          <div role="tablist" aria-label="Carrinho e recados" className="hidden md:flex shrink-0 gap-1 p-1.5 m-3 mb-0 rounded-full bg-warm">
            {tabBtn('carrinho', 'Carrinho', count)}
            {tabBtn('recados', 'Recados', unread)}
          </div>
          {tab === 'recados' ? chatPane : cartPane}
        </aside>
      </div>

      {/* Celular, fora do carrinho: total à vista com atalho. */}
      {tab !== 'carrinho' && (
        <div className="md:hidden shrink-0 border-t border-mist bg-paper px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
          <span>
            <span className="block text-[11px] text-faint">{count} {count === 1 ? 'item' : 'itens'}</span>
            <span className="block font-display text-lg text-ink tabular-nums leading-none">{formatCurrency(total)}</span>
          </span>
          <button type="button" onClick={() => setTab('carrinho')} className="h-10 px-5 rounded-full bg-ink text-paper text-[13px] font-semibold">Ver carrinho</button>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed z-40 left-1/2 -translate-x-1/2 top-16 w-[calc(100%-2rem)] max-w-sm flex items-center gap-3 rounded-full bg-ink text-paper pl-2 pr-5 py-2 shadow-lg animate-fade-up">
          <Avatar name={toast.by} size={28} ring={false} />
          <span className="text-[13px] leading-snug"><strong>{toast.by}</strong> {toast.text}</span>
        </div>
      )}
      {/* Erros num aviso flutuante: aparecem mesmo rolando o catálogo. */}
      {error && (
        <div role="alert" className="fixed z-50 left-1/2 -translate-x-1/2 top-16 w-[calc(100%-2rem)] max-w-sm flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 text-red-700 pl-4 pr-1.5 py-1.5 shadow-lg animate-fade-up">
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

      {picking && (
        <ProductSheet product={picking} onClose={() => setPicking(null)}
          onAdd={variantId => post({ op: 'add', productId: picking.id, variantId })} />
      )}
    </div>
  );
}
