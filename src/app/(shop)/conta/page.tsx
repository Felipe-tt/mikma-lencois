'use client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';
import { useWishlist } from '@/lib/hooks/useWishlist';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import { AccountSkeleton } from '@/components/ui/Skeleton';
import type { Address, Order, OrderStatus } from '@/types';

const ICON = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const LINKS = [
  {
    href: '/conta/pedidos',
    label: 'Meus pedidos',
    desc: 'Status, rastreio e histórico das suas compras',
    icon: <svg {...ICON}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  },
  {
    href: '/favoritos',
    label: 'Favoritos',
    desc: 'Os produtos que você salvou pra ver depois',
    icon: <svg {...ICON}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
  },
  {
    href: '/perfil',
    label: 'Meus dados',
    desc: 'Nome, endereço salvo e privacidade',
    icon: <svg {...ICON}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  },
  {
    href: '/trocas-e-devolucoes',
    label: 'Trocas e devoluções',
    desc: 'Como trocar ou devolver em até 7 dias',
    icon: <svg {...ICON}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>,
  },
];

// Etapas mostradas no cartão do pedido em andamento.
const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'paid',      label: 'Pago' },
  { key: 'preparing', label: 'Em preparo' },
  { key: 'shipped',   label: 'A caminho' },
  { key: 'delivered', label: 'Entregue' },
];
const STEP_INDEX: Partial<Record<OrderStatus, number>> = { pending_payment: -1, paid: 0, preparing: 1, shipped: 2, delivered: 3 };
const ACTIVE: OrderStatus[] = ['pending_payment', 'paid', 'preparing', 'shipped'];

function memberSince(creationTime?: string) {
  if (!creationTime) return null;
  const d = new Date(creationTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export default function ContaPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const { productIds } = useWishlist();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [address, setAddress] = useState<Address | null | undefined>(undefined);

  useEffect(() => {
    if (!loading && !user) router.push('/entrar');
  }, [user, loading, router]);

  // Últimos pedidos (pro cartão do pedido em andamento e a contagem) e o
  // endereço salvo. Falha silenciosa: a página continua útil sem eles.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getDocs(query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20)))
      .then(snap => { if (!cancelled) setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))); })
      .catch(() => { if (!cancelled) setOrders([]); });
    getDoc(doc(db, 'users', user.uid))
      .then(snap => { if (!cancelled) setAddress((snap.data()?.address as Address | undefined) ?? null); })
      .catch(() => { if (!cancelled) setAddress(null); });
    return () => { cancelled = true; };
  }, [user]);

  if (loading || !user) return <AccountSkeleton />;

  const firstName = user.displayName?.split(' ')[0] || 'cliente';
  const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
  const since = memberSince(auth.currentUser?.metadata.creationTime);
  const current = orders?.find(o => ACTIVE.includes(o.status));
  const placed = orders?.filter(o => o.status !== 'cancelled' && o.status !== 'payment_expired').length;

  return (
    <div>
      {/* ── Cabeçalho com avatar ── */}
      <div className="border-b border-mist bg-warm/60">
        <div className="container-shop py-10 sm:py-14 flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8 animate-fade-up">
          <span aria-hidden="true" className="w-[72px] h-[72px] sm:w-20 sm:h-20 shrink-0 rounded-full bg-clay text-paper font-display text-[2rem] sm:text-[2.3rem] flex items-center justify-center shadow-[0_12px_28px_-14px_rgba(180,87,68,0.7)] ring-4 ring-paper">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.08em] text-faint mb-2">Área do cliente</p>
            <h1 className="font-display font-normal text-ink text-[2.4rem] sm:text-5xl leading-[1.05] tracking-[-0.015em]">
              Olá, {firstName}
            </h1>
            <p className="text-[13px] text-mid mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate">{user.email}</span>
              {since && <><span className="text-mist-d" aria-hidden="true">·</span><span>Cliente desde {since}</span></>}
            </p>
          </div>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20 flex flex-col gap-8 sm:gap-10">

        {/* ── Pedido em andamento ── */}
        <section aria-labelledby="pedido-atual" className="animate-fade-up [animation-delay:60ms]">
          <h2 id="pedido-atual" className="font-sans text-[10px] font-bold tracking-[0.18em] uppercase text-faint mb-3">Pedido em andamento</h2>
          {orders === null ? (
            <div className="skeleton h-[148px] !rounded-3xl" />
          ) : current ? (
            <CurrentOrderCard order={current} />
          ) : (
            <div className="rounded-3xl border border-dashed border-mist-d px-6 py-8 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div>
                <p className="font-display text-[1.35rem] text-ink leading-tight">Nenhum pedido em andamento</p>
                <p className="text-[13px] text-mid mt-1.5">{placed ? 'Seus pedidos anteriores ficam em Meus pedidos.' : 'Quando você comprar, acompanha tudo por aqui.'}</p>
              </div>
              <Link href="/produtos" className="btn-primary shrink-0 self-start sm:self-auto">Ver produtos</Link>
            </div>
          )}
        </section>

        {/* ── Resumo rápido ── */}
        <section aria-label="Resumo da conta" className="grid grid-cols-3 gap-2.5 sm:gap-4 animate-fade-up [animation-delay:120ms]">
          <Stat href="/conta/pedidos" label={placed === 1 ? 'Pedido' : 'Pedidos'} value={placed} />
          <Stat href="/favoritos" label={productIds.length === 1 ? 'Favorito' : 'Favoritos'} value={productIds.length} />
          <Stat
            href="/perfil"
            label="Endereço"
            value={address === undefined ? undefined : address ? address.city : '—'}
            hint={address ? address.state : address === null ? 'Nenhum salvo' : undefined}
            small
          />
        </section>

        {/* ── Atalhos ── */}
        <section aria-label="Atalhos" className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 animate-fade-up [animation-delay:180ms]">
          {LINKS.map(({ href, label, desc, icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-4 sm:gap-5 rounded-2xl border border-mist bg-paper px-5 py-5 sm:px-6 hover:border-mist-d hover:bg-warm/50 hover:shadow-[0_14px_30px_-22px_rgba(30,18,8,0.35)] transition-[background-color,border-color,box-shadow] duration-200"
            >
              <span aria-hidden="true" className="w-11 h-11 rounded-full bg-clay/10 text-clay flex items-center justify-center shrink-0 transition-colors duration-200 group-hover:bg-clay group-hover:text-paper">{icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{label}</span>
                <span className="block text-[13px] text-mid mt-0.5 leading-snug">{desc}</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                className="shrink-0 text-faint transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-ink">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          ))}
        </section>

        <button
          onClick={logout}
          className="self-start inline-flex items-center gap-2 h-10 px-4 -ml-4 rounded-full text-[13px] text-mid hover:text-ink hover:bg-warm transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sair da conta
        </button>
      </div>
    </div>
  );
}

function Stat({ href, label, value, hint, small }: { href: string; label: string; value: number | string | undefined; hint?: string; small?: boolean }) {
  return (
    <Link href={href} className="group rounded-2xl border border-mist bg-paper px-4 py-4 sm:px-6 sm:py-5 hover:border-mist-d hover:bg-warm/50 transition-colors duration-200 min-w-0">
      <span className="block text-[10px] sm:text-[11px] font-semibold tracking-[0.1em] uppercase text-faint">{label}</span>
      {value === undefined ? (
        <span className="skeleton block h-7 w-12 mt-2" />
      ) : (
        <span className={`block font-display text-ink leading-none mt-2 tabular-nums break-words ${small ? 'text-[1.05rem] sm:text-[1.6rem] leading-tight' : 'text-[1.8rem] sm:text-[2.2rem]'}`}>{value}</span>
      )}
      {hint && <span className="block text-[11px] sm:text-[12px] text-faint mt-1.5 truncate">{hint}</span>}
    </Link>
  );
}

function CurrentOrderCard({ order }: { order: Order }) {
  const step = STEP_INDEX[order.status] ?? -1;
  const pending = order.status === 'pending_payment';
  const first = order.items[0];
  return (
    <Link
      href={`/pedidos/${order.id}`}
      className="group block rounded-3xl border border-mist bg-paper p-5 sm:p-7 hover:border-mist-d hover:shadow-[0_18px_40px_-26px_rgba(30,18,8,0.4)] transition-[border-color,box-shadow] duration-200"
    >
      <div className="flex items-start gap-4 sm:gap-5">
        {first?.image && (
          <span className="relative w-14 h-[70px] sm:w-16 sm:h-20 shrink-0 rounded-xl overflow-hidden bg-warm">
            <img src={first.image} alt="" className="w-full h-full object-cover" />
            {order.items.length > 1 && (
              <span className="absolute bottom-1 right-1 min-w-[20px] h-5 px-1 rounded-full bg-ink/85 text-paper text-[10px] font-bold flex items-center justify-center">+{order.items.length - 1}</span>
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-faint flex flex-wrap gap-x-2">
                <span className="font-mono">#{order.id.slice(-8).toUpperCase()}</span>
                {order.createdAt && <span className="whitespace-nowrap">{formatTsDateTime(order.createdAt)}</span>}
              </p>
              <p className="text-[14px] sm:text-[15px] font-semibold text-ink mt-1 leading-snug line-clamp-2">
                {first?.productName}{order.items.length > 1 ? ` e mais ${order.items.length - 1}` : ''}
              </p>
            </div>
            <p className="font-display text-[1.3rem] text-ink leading-none shrink-0 tabular-nums">{formatCurrency(order.totalCents)}</p>
          </div>

          {pending ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 px-3 py-1.5 text-[12px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
              Aguardando pagamento
            </p>
          ) : (
            <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Andamento do pedido">
              {STEPS.map((s, i) => (
                <li key={s.key} className="min-w-0">
                  <span className={`block h-1.5 rounded-full transition-colors ${i <= step ? 'bg-clay' : 'bg-mist'}`} />
                  <span className={`block mt-2 text-[11px] truncate ${i === step ? 'text-ink font-semibold' : i < step ? 'text-mid' : 'text-faint'}`}>{s.label}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <p className="mt-5 pt-4 border-t border-mist flex items-center justify-between text-[13px] font-medium text-ink">
        {pending ? 'Pagar ou ver detalhes' : 'Acompanhar pedido'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </p>
    </Link>
  );
}
