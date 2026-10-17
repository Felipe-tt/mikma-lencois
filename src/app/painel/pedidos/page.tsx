'use client';
import React from 'react';

import { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, where, limit } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';
import { PainelSkeleton } from '@/components/painel/PainelSkeleton';
import { PanelErrorState } from '@/components/painel/PanelErrorState';
import Link from 'next/link';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import {
  IconAlert, IconBox, IconTruck, IconCheck, IconHourglass, IconX,
  IconSearch, IconPin, IconArrowRight,
} from '@/components/ui/Icon';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  payment_expired: 'PIX expirado',
  paid:            'Pago',
  preparing:       'Separando',
  shipped:         'A caminho',
  delivered:       'Entregue',
  cancelled:       'Cancelado',
};

const BADGE: Record<string, string> = {
  pending_payment: 'badge-pending',
  payment_expired: 'badge-pending',
  paid:            'badge-paid',
  preparing:       'badge-preparing',
  shipped:         'badge-shipped',
  delivered:       'badge-delivered',
  cancelled:       'badge-cancelled',
};

const FILTERS: { id: string; label: string; Icon?: React.FC<React.SVGProps<SVGSVGElement> & { size?: number }> }[] = [
  { id: 'todos',           label: 'Todos' },
  { id: 'paid',            label: 'Precisam separar',   Icon: IconAlert },
  { id: 'preparing',       label: 'Separando',          Icon: IconBox },
  { id: 'shipped',         label: 'A caminho',          Icon: IconTruck },
  { id: 'delivered',       label: 'Entregues',          Icon: IconCheck },
  { id: 'pending_payment', label: 'Aguardando pgto',    Icon: IconHourglass },
  { id: 'payment_expired', label: 'PIX expirado',       Icon: IconHourglass },
  { id: 'cancelled',       label: 'Cancelados',         Icon: IconX },
];

function paymentLabel(order: Order) {
  const method = order.payment?.method;
  if (method === 'card') {
    const n = order.payment?.installments ?? 1;
    return n > 1 ? `Cartão ${n}x` : 'Cartão à vista';
  }
  return 'PIX';
}

function carrierLabel(carrier?: string) {
  if (!carrier) return '';
  if (carrier === 'pickup') return 'Retirada';
  if (carrier.startsWith('correios_pac')) return 'Correios PAC';
  if (carrier.startsWith('correios_sedex')) return 'Correios SEDEX';
  if (carrier.startsWith('jadlog')) return 'Jadlog';
  if (carrier === 'uber_direct') return 'Uber Direct';
  if (carrier === 'manual') return 'Entrega própria';
  return carrier.replace(/_/g, ' ');
}

const PAGE = 50;
const ACTIVE_STATUSES = ['paid', 'preparing', 'pending_payment'];

export default function PainelPedidos() {
  // Antes um listener em tempo real sobre TODOS os pedidos da loja: no 4G
  // o painel ia ficando mais lento (e caro) a cada venda. Agora:
  // - pedidos que pedem ação (pagos, separando, aguardando) sempre todos;
  // - o histórico vem de 50 em 50, com o filtro aplicado no servidor.
  const [active, setActive] = useState<Order[]>([]);
  const [page, setPage] = useState<Order[]>([]);
  const [pageSize, setPageSize] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [customers, setCustomers] = useState<Record<string, { name?: string; email?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilterState] = useState('todos');
  // Filtro na URL (?status=paid): os avisos do início abrem a lista já
  // filtrada, e voltar do pedido mantém o filtro em que a pessoa estava.
  // Lido do location depois de montar (useSearchParams exigiria Suspense).
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('status');
    if (s && FILTERS.some(f => f.id === s)) setFilterState(s);
  }, []);
  function setFilter(id: string) {
    setFilterState(id);
    const url = new URL(window.location.href);
    if (id === 'todos') url.searchParams.delete('status'); else url.searchParams.set('status', id);
    window.history.replaceState(window.history.state, '', url);
  }
  const [search, setSearch] = useState('');
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'orders'), where('status', 'in', ACTIVE_STATUSES)),
      snap => { setActive(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))); setLoadError(false); },
      err => { console.error('[painel/pedidos] onSnapshot ativos:', err); setLoadError(true); setLoading(false); }
    );
  }, []);

  useEffect(() => {
    const base = collection(db, 'orders');
    const q = filter === 'todos'
      ? query(base, orderBy('createdAt', 'desc'), limit(pageSize))
      : query(base, where('status', '==', filter), orderBy('createdAt', 'desc'), limit(pageSize));
    return onSnapshot(
      q,
      snap => {
        setPage(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
        setHasMore(snap.size >= pageSize);
        setLoadError(false); setLoading(false); setLoadingMore(false);
      },
      err => { console.error('[painel/pedidos] onSnapshot:', err); setLoadError(true); setLoading(false); setLoadingMore(false); }
    );
  }, [filter, pageSize]);

  useEffect(() => { setPageSize(PAGE); }, [filter]);

  // Junta os dois conjuntos (sem repetir) na ordem do mais novo pro mais antigo.
  const orders = useMemo(() => {
    const byId = new Map<string, Order>();
    for (const o of page) byId.set(o.id, o);
    if (filter === 'todos' || ACTIVE_STATUSES.includes(filter)) {
      for (const o of active) if (filter === 'todos' || o.status === filter) byId.set(o.id, o);
    }
    const ts = (o: Order) => {
      const d = o.createdAt as unknown;
      if (d && typeof d === 'object' && 'seconds' in (d as object)) return (d as { seconds: number }).seconds * 1000;
      return Date.parse(String(d ?? '')) || 0;
    };
    return Array.from(byId.values()).sort((a, b) => ts(b) - ts(a));
  }, [page, active, filter]);

  // Busca os dados de cliente (nome/e-mail) dos pedidos atuais, Order só
  // guarda userId, então carrega em lote a cada mudança no conjunto de
  // usuários referenciados, em vez de 1 leitura por pedido a cada render.
  useEffect(() => {
    // Pedidos novos já trazem customerName/customerEmail; só busca o
    // cadastro dos antigos.
    const ids = Array.from(new Set(
      orders.filter(o => !(o as Order & { customerName?: string }).customerName).map(o => o.userId).filter(Boolean)
    ));
    const missing = ids.filter(id => !(id in customers));
    if (missing.length === 0) return;

    (async () => {
      const { doc: docRef, getDoc } = await import('firebase/firestore');
      const entries = await Promise.all(
        missing.map(async id => {
          try {
            const snap = await getDoc(docRef(db, 'users', id));
            const d = snap.data();
            return [id, { name: d?.name as string | undefined, email: d?.email as string | undefined }] as const;
          } catch {
            return [id, {}] as const;
          }
        })
      );
      setCustomers(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
  }, [orders, customers]);

  // Antes chamava com PATCH (a rota só aceita POST) e não olhava a
  // resposta: o botão mostrava "Atualizando…" e nada acontecia.
  async function markPreparing(orderId: string) {
    setUpdating(orderId);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/orders/${orderId}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fromStatus: 'paid' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        await confirmDialog({ message: err.error ?? 'Não deu pra atualizar o pedido. Tente de novo.', alertOnly: true });
      }
    } catch {
      await confirmDialog({ message: 'Sem conexão. Tente de novo.', alertOnly: true });
    } finally { setUpdating(null); }
  }

  // Só Uber Direct e retirada despacham por aqui; Correios/Jadlog precisam
  // do código de rastreio, que é informado no detalhe do pedido.
  async function dispatch(orderId: string, forceOverspend = false) {
    setDispatching(orderId);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, ...(forceOverspend ? { forceOverspend: true } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Mesmo tratamento do detalhe do pedido: a Uber recotou acima da
        // margem e o servidor pede confirmação. Antes aparecia o código cru
        // "overspend_confirmation_required" e não dava pra confirmar.
        if (err.error === 'overspend_confirmation_required') {
          const { confirmed } = await confirmDialog({
            message: 'Custo da Uber Direct acima do frete cobrado',
            detail: err.message,
            confirmLabel: 'Despachar mesmo assim',
            variant: 'danger',
          });
          if (confirmed) { setDispatching(null); return dispatch(orderId, true); }
          return;
        }
        await confirmDialog({ message: err.error ?? 'Não deu pra despachar. Abra o pedido pra ver os detalhes.', alertOnly: true });
      }
    } catch {
      await confirmDialog({ message: 'Sem conexão. Tente de novo.', alertOnly: true });
    } finally { setDispatching(null); }
  }

  async function handleDeleteCancelled() {
    const cancelled = orders.filter(o => o.status === 'cancelled');
    if (!cancelled.length) return;
    const count = cancelled.length;
    const { confirmed } = await confirmDialog({
      message: `Apagar ${count} pedido${count !== 1 ? 's' : ''} cancelado${count !== 1 ? 's' : ''}?`,
      detail: 'Só são apagados os cancelados há mais de 30 dias que nunca foram pagos. Pedidos estornados ficam no histórico. Esta ação não tem como desfazer.',
      confirmLabel: 'Apagar pedidos',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/orders/delete-cancelled', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error);
      const kept = count - (data.deleted ?? 0);
      await confirmDialog({
        message: `${data.deleted ?? 0} pedido${data.deleted === 1 ? '' : 's'} apagado${data.deleted === 1 ? '' : 's'}.`,
        detail: kept > 0 ? `${kept} ${kept === 1 ? 'ficou' : 'ficaram'}: pedidos que chegaram a ser pagos (estornos) ou cancelados há menos de 30 dias ficam guardados pro histórico.` : undefined,
        alertOnly: true,
      });
    } catch (err) {
      await confirmDialog({ message: err instanceof Error && err.message ? err.message : 'Erro ao apagar. Tente novamente.', alertOnly: true });
    }
  }

  const filtered = useMemo(() => {
    let list = orders;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(o => {
        const own = o as Order & { customerName?: string; customerEmail?: string };
        const c = own.customerName ? { name: own.customerName, email: own.customerEmail } : customers[o.userId];
        return (
          o.id.toLowerCase().includes(q) ||
          (c?.name ?? '').toLowerCase().includes(q) ||
          (c?.email ?? '').toLowerCase().includes(q) ||
          (o.address?.city ?? '').toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [orders, customers, filter, search]);

  const needActionCount  = active.filter(o => o.status === 'paid').length;
  const cancelledCount   = orders.filter(o => o.status === 'cancelled').length;
  // Mesmo critério do início: pagos hoje (antes contava também cancelados
  // e PIX não pagos criados hoje, e os dois números não batiam).
  const todayCount       = [...active, ...page].filter((o, i, all) => {
    if (all.findIndex(x => x.id === o.id) !== i) return false;
    const d = o.payment?.paidAt as unknown;
    if (!d || o.status === 'cancelled') return false;
    const date = typeof d === 'object' && 'seconds' in (d as object) ? new Date((d as {seconds:number}).seconds * 1000) : new Date(d as string);
    return date.toDateString() === new Date().toDateString();
  }).length;

  if (loading) return <PainelSkeleton rows={6} />;
  if (loadError) return <PanelErrorState message="Não foi possível carregar os pedidos." />;

  return (
    <div className="max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-display font-normal text-ink text-2xl">Pedidos</h1>
          <p className="text-[13px] text-faint mt-1">
            {todayCount} pedido{todayCount === 1 ? '' : 's'} pago{todayCount === 1 ? '' : 's'} hoje
          </p>
        </div>
      </div>

      {/* Alerta de ação necessária */}
      {needActionCount > 0 && (
        <div className="bg-clay-l/10 border border-clay-l/30 px-4 py-3.5 mb-5 flex items-center gap-3 rounded-xl">
          <IconAlert size={18} className="shrink-0 text-clay-l" />
          <p className="text-[13px] text-ink flex-1">
            <strong>{needActionCount} pedido{needActionCount > 1 ? 's' : ''} pago{needActionCount > 1 ? 's' : ''}</strong> esperando você separar.
          </p>
          <button onClick={() => setFilter('paid')}
            className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 bg-clay-l text-paper hover:bg-clay-d transition-colors rounded-full">
            Ver agora
          </button>
        </div>
      )}

      {/* Filtros + Busca */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map(f => {
            // Contagem exata só dos que pedem ação (carregados inteiros);
            // o histórico é paginado, então ali não mostra número.
            const count = ACTIVE_STATUSES.includes(f.id) ? active.filter(o => o.status === f.id).length : null;
            if (count === 0 && filter !== f.id) return null;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold border transition-colors ${ filter === f.id ? 'bg-ink text-paper border-ink' : 'bg-paper text-mid border-mist hover:bg-warm' } rounded-full`}>
                {f.Icon && <f.Icon size={11} className="shrink-0" />}
                {f.label}
                {count !== null && <span className={`text-[9px] font-bold ${filter === f.id ? 'opacity-40' : 'opacity-50'}`}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Busca */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou ID do pedido…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-mist bg-white dark:bg-warm focus:outline-none focus:ring-2 focus:ring-clay-l/20 focus:border-clay-l/60 rounded-xl"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="border border-mist overflow-hidden divide-y divide-mist rounded-xl">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <IconSearch size={32} className="text-mist mx-auto mb-3" />
            <p className="text-sm text-faint">
              {search ? `Nenhum pedido encontrado para "${search}"` : 'Nenhum pedido nessa categoria.'}
            </p>
          </div>
        ) : filtered.map(order => (
          // Linha inteira clicável (link "esticado" por cima); botões de ação
          // ficam acima dele com z-index.
          <div key={order.id} className="relative px-5 py-4 hover:bg-paper active:bg-warm transition-colors bg-white dark:bg-warm [&_button]:relative [&_button]:z-[1]">

            {/* Linha principal */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono text-faint bg-warm px-1.5 py-0.5 rounded-md">
                    #{order.id.slice(-8).toUpperCase()}
                  </span>
                  <span className={BADGE[order.status] ?? 'badge'}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                  <span className="text-sm font-bold text-ink">
                    {formatCurrency(order.totalCents)}
                  </span>
                </div>
                {/* Cliente */}
                {(() => {
                  const name = (order as Order & { customerName?: string }).customerName || customers[order.userId]?.name;
                  return name ? <p className="text-[13px] text-ink font-medium">{name}</p> : null;
                })()}
                {/* Detalhes */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[11px] text-faint">{formatTsDateTime(order.createdAt)}</span>
                  <span className="text-[11px] text-faint">{paymentLabel(order)}</span>
                  {order.delivery?.carrier && (
                    <span className="text-[11px] text-faint">{carrierLabel(order.delivery.carrier)}</span>
                  )}
                  {order.address?.city && (
                    <span className="text-[11px] text-faint flex items-center gap-1"><IconPin size={10} />{order.address.city}, {order.address.state}</span>
                  )}
                </div>
                {/* Itens */}
                {order.items?.length > 0 && (
                  <p className="text-[11px] text-faint">
                    {order.items.map(i => `${i.quantity}x ${i.productName ?? i.productId}`).join(' · ')}
                  </p>
                )}
              </div>

              <Link href={`/painel/pedidos/${order.id}`}
                aria-label={`Ver pedido #${order.id.slice(-8).toUpperCase()}`}
                className="shrink-0 self-center w-9 h-9 flex items-center justify-center rounded-full text-faint hover:text-ink hover:bg-warm transition-colors after:absolute after:inset-0 after:content-['']">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
              </Link>
            </div>

            {/* CTA pago */}
            {order.status === 'paid' && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-clay-l/5 border border-clay-l/20 rounded-xl">
                <IconArrowRight size={16} className="shrink-0 text-clay-l" />
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-ink">Pagamento confirmado, separe o pedido!</p>
                  <p className="text-[11px] text-faint">Clique quando começar a preparar.</p>
                </div>
                <button onClick={() => markPreparing(order.id)} disabled={updating === order.id}
                  className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-4 py-2 bg-clay text-paper hover:bg-clay-d active:scale-[0.97] transition-[background-color,transform] disabled:opacity-50 rounded-full">
                  {updating === order.id ? 'Atualizando…' : 'Comecei a separar'}
                </button>
              </div>
            )}

            {/* CTA separando */}
            {order.status === 'preparing' && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-ink/5 border border-ink/10 rounded-xl">
                <IconBox size={16} className="shrink-0" />
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-ink">Separando o pedido</p>
                  <p className="text-[11px] text-faint">Quando embalado e pronto para sair, clique em Despachar.</p>
                </div>
                {order.delivery?.carrier === 'uber_direct' || order.delivery?.carrier === 'pickup' ? (
                  <button onClick={() => dispatch(order.id)} disabled={dispatching === order.id}
                    className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-4 py-2 bg-ink text-paper hover:bg-ink/80 active:scale-[0.97] transition-[background-color,transform] disabled:opacity-50 rounded-full">
                    {dispatching === order.id ? 'Enviando…' : 'Despachar agora'}
                  </button>
                ) : (
                  <Link href={`/painel/pedidos/${order.id}`}
                    className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-4 py-2 bg-ink text-paper hover:bg-ink/80 active:scale-[0.97] transition-[background-color,transform] rounded-full">
                    Informar rastreio
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {hasMore && !search.trim() && (
        <button
          type="button"
          onClick={() => { setLoadingMore(true); setPageSize(n => n + PAGE); }}
          disabled={loadingMore}
          className="mt-4 w-full min-h-11 border border-mist bg-paper text-[12px] font-semibold text-mid hover:bg-warm hover:text-ink active:scale-[0.99] transition-[background-color,color,transform] duration-150 disabled:opacity-60 rounded-xl inline-flex items-center justify-center gap-2"
        >
          {loadingMore ? <><span className="spinner-dark" />Carregando…</> : 'Carregar mais pedidos'}
        </button>
      )}
      {hasMore && search.trim() && (
        <p className="mt-3 text-[11px] text-faint text-center">
          A busca olha os pedidos já carregados.{' '}
          <button type="button" onClick={() => { setLoadingMore(true); setPageSize(n => n + PAGE); }} className="font-semibold text-clay underline underline-offset-2">
            Carregar mais
          </button>
        </p>
      )}

      {/* Limpar cancelados */}
      {cancelledCount > 0 && (
        <div className="mt-4 flex items-center justify-between bg-paper border border-mist px-4 py-3 rounded-xl">
          <p className="text-[12px] text-faint">
            {cancelledCount} pedido{cancelledCount > 1 ? 's' : ''} cancelado{cancelledCount > 1 ? 's' : ''} na lista.
          </p>
          <button onClick={handleDeleteCancelled}
            className="text-[11px] font-semibold text-red-400 hover:text-red-600 transition-colors">
            Limpar cancelados
          </button>
        </div>
      )}
    </div>
  );
}
