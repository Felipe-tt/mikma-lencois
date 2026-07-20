'use client';
import React from 'react';

import { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';
import { PainelSkeleton } from '@/components/painel/PainelSkeleton';
import Link from 'next/link';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import {
  IconAlert, IconBox, IconTruck, IconCheck, IconHourglass, IconX,
  IconSearch, IconPin, IconArrowRight,
} from '@/components/ui/Icon';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  paid:            'Pago',
  preparing:       'Separando',
  shipped:         'Despachado',
  delivered:       'Entregue',
  cancelled:       'Cancelado',
};

const BADGE: Record<string, string> = {
  pending_payment: 'badge-pending',
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
  { id: 'shipped',         label: 'Despachados',        Icon: IconTruck },
  { id: 'delivered',       label: 'Entregues',          Icon: IconCheck },
  { id: 'pending_payment', label: 'Aguardando pgto',    Icon: IconHourglass },
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
  return carrier;
}

export default function PainelPedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Record<string, { name?: string; email?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      snap => { setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))); setLoading(false); }
    );
  }, []);

  // Busca os dados de cliente (nome/e-mail) dos pedidos atuais — Order só
  // guarda userId, então carrega em lote a cada mudança no conjunto de
  // usuários referenciados, em vez de 1 leitura por pedido a cada render.
  useEffect(() => {
    const ids = Array.from(new Set(orders.map(o => o.userId).filter(Boolean)));
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

  async function markPreparing(orderId: string) {
    setUpdating(orderId);
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`/api/orders/${orderId}/update-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'preparing' }),
      });
    } finally { setUpdating(null); }
  }

  async function dispatch(orderId: string) {
    setDispatching(orderId);
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId }),
      });
    } finally { setDispatching(null); }
  }

  async function handleDeleteCancelled() {
    const cancelled = orders.filter(o => o.status === 'cancelled');
    if (!cancelled.length) return;
    const count = cancelled.length;
    const { confirmed } = await confirmDialog({
      message: `Apagar ${count} pedido${count !== 1 ? 's' : ''} cancelado${count !== 1 ? 's' : ''}?`,
      detail: 'Os pedidos serão removidos permanentemente. Esta ação não tem como desfazer.',
      confirmLabel: 'Apagar pedidos',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/orders/delete-cancelled', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    } catch {
      await confirmDialog({ message: 'Erro ao apagar. Tente novamente.', alertOnly: true });
    }
  }

  const filtered = useMemo(() => {
    let list = filter === 'todos' ? orders : orders.filter(o => o.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(o => {
        const c = customers[o.userId];
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

  const needActionCount  = orders.filter(o => o.status === 'paid').length;
  const cancelledCount   = orders.filter(o => o.status === 'cancelled').length;
  const todayCount       = orders.filter(o => {
    const d = o.createdAt;
    if (!d) return false;
    const date = typeof d === 'object' && 'seconds' in d ? new Date((d as {seconds:number}).seconds * 1000) : new Date(d as string);
    return date.toDateString() === new Date().toDateString();
  }).length;

  if (loading) return <PainelSkeleton rows={6} />;

  return (
    <div className="max-w-6xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-clay-l mb-1">Painel</p>
          <h1 className="font-display font-normal text-ink text-2xl">Pedidos</h1>
          <p className="text-[13px] text-faint mt-1">
            {orders.length} pedido(s) no total · {todayCount} hoje
          </p>
        </div>
      </div>

      {/* Alerta de ação necessária */}
      {needActionCount > 0 && (
        <div className="bg-clay-l/10 border border-clay-l/30 px-4 py-3.5 mb-5 flex items-center gap-3">
          <IconAlert size={18} className="shrink-0 text-clay-l" />
          <p className="text-[13px] text-ink flex-1">
            <strong>{needActionCount} pedido{needActionCount > 1 ? 's' : ''} pago{needActionCount > 1 ? 's' : ''}</strong> esperando você separar.
          </p>
          <button onClick={() => setFilter('paid')}
            className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 bg-clay-l text-paper hover:bg-clay-d transition-colors">
            Ver agora
          </button>
        </div>
      )}

      {/* Filtros + Busca */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map(f => {
            const count = f.id === 'todos' ? orders.length : orders.filter(o => o.status === f.id).length;
            if (f.id !== 'todos' && count === 0) return null;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold border transition-colors ${
                  filter === f.id
                    ? 'bg-ink text-paper border-ink'
                    : 'bg-paper text-mid border-mist hover:bg-warm'
                }`}>
                {f.Icon && <f.Icon size={11} className="shrink-0" />}
                {f.label}
                <span className={`text-[9px] font-bold ${filter === f.id ? 'opacity-40' : 'opacity-50'}`}>{count}</span>
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
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-mist bg-white dark:bg-warm focus:outline-none focus:ring-2 focus:ring-clay-l/20 focus:border-clay-l/60"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="border border-mist overflow-hidden divide-y divide-mist">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <IconSearch size={32} className="text-mist mx-auto mb-3" />
            <p className="text-sm text-faint">
              {search ? `Nenhum pedido encontrado para "${search}"` : 'Nenhum pedido nessa categoria.'}
            </p>
          </div>
        ) : filtered.map(order => (
          <div key={order.id} className="px-5 py-4 hover:bg-paper transition-colors bg-white dark:bg-warm">

            {/* Linha principal */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono text-faint bg-warm px-1.5 py-0.5">
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
                {customers[order.userId]?.name && (
                  <p className="text-[13px] text-ink font-medium">{customers[order.userId]!.name}</p>
                )}
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
                className="shrink-0 text-[11px] font-semibold text-clay-l hover:text-clay-d transition-colors border border-clay-l/30 px-3 py-1.5 hover:bg-clay-l/5">
                Ver detalhes
              </Link>
            </div>

            {/* CTA pago */}
            {order.status === 'paid' && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-clay-l/5 border border-clay-l/20">
                <IconArrowRight size={16} className="shrink-0 text-clay-l" />
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-ink">Pagamento confirmado — separe o pedido!</p>
                  <p className="text-[11px] text-faint">Clique quando começar a preparar.</p>
                </div>
                <button onClick={() => markPreparing(order.id)} disabled={updating === order.id}
                  className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-4 py-2 bg-clay-l text-paper hover:bg-clay-d transition-colors disabled:opacity-50">
                  {updating === order.id ? 'Atualizando…' : 'Comecei a separar'}
                </button>
              </div>
            )}

            {/* CTA separando */}
            {order.status === 'preparing' && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-ink/5 border border-ink/10">
                <IconBox size={16} className="shrink-0" />
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-ink">Separando o pedido</p>
                  <p className="text-[11px] text-faint">Quando embalado e pronto para sair, clique em Despachar.</p>
                </div>
                <button onClick={() => dispatch(order.id)} disabled={dispatching === order.id}
                  className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-4 py-2 bg-ink text-paper hover:bg-ink/80 transition-colors disabled:opacity-50">
                  {dispatching === order.id ? 'Enviando…' : 'Despachar agora'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Limpar cancelados */}
      {cancelledCount > 0 && (
        <div className="mt-4 flex items-center justify-between bg-paper border border-mist px-4 py-3">
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
