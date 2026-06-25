'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';
import { PainelSkeleton } from '@/components/painel/PainelSkeleton';
import Link from 'next/link';

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

const FILTERS = [
  { id: 'todos',           label: 'Todos',              emoji: '' },
  { id: 'paid',            label: 'Precisam separar',   emoji: '🔴' },
  { id: 'preparing',       label: 'Separando',          emoji: '📦' },
  { id: 'shipped',         label: 'Despachados',        emoji: '🚚' },
  { id: 'delivered',       label: 'Entregues',          emoji: '✓' },
  { id: 'pending_payment', label: 'Aguardando pgto',    emoji: '⏳' },
  { id: 'cancelled',       label: 'Cancelados',         emoji: '✕' },
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
  if (carrier === 'pickup') return '🏠 Retirada';
  if (carrier.startsWith('correios_pac')) return '📮 Correios PAC';
  if (carrier.startsWith('correios_sedex')) return '⚡ SEDEX';
  if (carrier.startsWith('jadlog')) return '🚚 Jadlog';
  return carrier;
}

export default function PainelPedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
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

  async function markPreparing(orderId: string) {
    setUpdating(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: 'preparing', updatedAt: serverTimestamp() });
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
    if (!confirm(`Apagar ${cancelled.length} pedido(s) cancelado(s)?`)) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/orders/delete-cancelled', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    } catch { alert('Erro ao apagar. Tente novamente.'); }
  }

  const filtered = useMemo(() => {
    let list = filter === 'todos' ? orders : orders.filter(o => o.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(o =>
        o.id.toLowerCase().includes(q) ||
        (o.customer?.name ?? '').toLowerCase().includes(q) ||
        (o.customer?.email ?? '').toLowerCase().includes(q) ||
        (o.address?.city ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, filter, search]);

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
    <div className="max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Painel</p>
          <h1 className="font-display font-normal text-[#1E1208] text-2xl">Pedidos</h1>
          <p className="text-[13px] text-[#B09C8C] mt-1">
            {orders.length} pedido(s) no total · {todayCount} hoje
          </p>
        </div>
      </div>

      {/* Alerta de ação necessária */}
      {needActionCount > 0 && (
        <div className="bg-[#C4714A]/10 border border-[#C4714A]/30 px-4 py-3.5 mb-5 flex items-center gap-3">
          <span className="text-xl shrink-0">🔴</span>
          <p className="text-[13px] text-[#1E1208] flex-1">
            <strong>{needActionCount} pedido{needActionCount > 1 ? 's' : ''} pago{needActionCount > 1 ? 's' : ''}</strong> esperando você separar.
          </p>
          <button onClick={() => setFilter('paid')}
            className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 bg-[#C4714A] text-white hover:bg-[#A05432] transition-colors">
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
                    ? 'bg-[#1E1208] text-[#FAF8F5] border-[#1E1208]'
                    : 'bg-[#FAF8F5] text-[#705A48] border-[#E6DFD5] hover:bg-[#F0EBE1]'
                }`}>
                {f.emoji && <span>{f.emoji}</span>}
                {f.label}
                <span className={`text-[9px] font-bold ${filter === f.id ? 'opacity-40' : 'opacity-50'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Busca */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B09C8C]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou ID do pedido…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-[#E6DFD5] bg-white focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="border border-[#E6DFD5] overflow-hidden divide-y divide-[#E6DFD5]">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-3xl mb-3">{search ? '🔍' : '🎉'}</p>
            <p className="text-sm text-[#B09C8C]">
              {search ? `Nenhum pedido encontrado para "${search}"` : 'Nenhum pedido nessa categoria.'}
            </p>
          </div>
        ) : filtered.map(order => (
          <div key={order.id} className="px-5 py-4 hover:bg-[#FAF8F5] transition-colors bg-white">

            {/* Linha principal */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono text-[#B09C8C] bg-[#F0EBE1] px-1.5 py-0.5">
                    #{order.id.slice(-8).toUpperCase()}
                  </span>
                  <span className={BADGE[order.status] ?? 'badge'}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                  <span className="text-sm font-bold text-[#1E1208]">
                    {formatCurrency(order.totalCents)}
                  </span>
                </div>
                {/* Cliente */}
                {order.customer?.name && (
                  <p className="text-[13px] text-[#1E1208] font-medium">{order.customer.name}</p>
                )}
                {/* Detalhes */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[11px] text-[#B09C8C]">{formatTsDateTime(order.createdAt)}</span>
                  <span className="text-[11px] text-[#B09C8C]">{paymentLabel(order)}</span>
                  {order.delivery?.carrier && (
                    <span className="text-[11px] text-[#B09C8C]">{carrierLabel(order.delivery.carrier)}</span>
                  )}
                  {order.address?.city && (
                    <span className="text-[11px] text-[#B09C8C]">📍 {order.address.city}, {order.address.state}</span>
                  )}
                </div>
                {/* Itens */}
                {order.items?.length > 0 && (
                  <p className="text-[11px] text-[#B09C8C]">
                    {order.items.map(i => `${i.quantity}x ${i.productName ?? i.productId}`).join(' · ')}
                  </p>
                )}
              </div>

              <Link href={`/painel/pedidos/${order.id}`}
                className="shrink-0 text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors border border-[#C4714A]/30 px-3 py-1.5 hover:bg-[#C4714A]/5">
                Ver detalhes →
              </Link>
            </div>

            {/* CTA pago */}
            {order.status === 'paid' && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-[#C4714A]/5 border border-[#C4714A]/20">
                <span className="text-base shrink-0">👉</span>
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-[#1E1208]">Pagamento confirmado — separe o pedido!</p>
                  <p className="text-[11px] text-[#B09C8C]">Clique quando começar a preparar.</p>
                </div>
                <button onClick={() => markPreparing(order.id)} disabled={updating === order.id}
                  className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-4 py-2 bg-[#C4714A] text-white hover:bg-[#A05432] transition-colors disabled:opacity-50">
                  {updating === order.id ? 'Atualizando…' : 'Comecei a separar'}
                </button>
              </div>
            )}

            {/* CTA separando */}
            {order.status === 'preparing' && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-[#1E1208]/5 border border-[#1E1208]/10">
                <span className="text-base shrink-0">📦</span>
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-[#1E1208]">Separando o pedido</p>
                  <p className="text-[11px] text-[#B09C8C]">Quando embalado e pronto para sair, clique em Despachar.</p>
                </div>
                <button onClick={() => dispatch(order.id)} disabled={dispatching === order.id}
                  className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-4 py-2 bg-[#1E1208] text-white hover:bg-[#1E1208]/80 transition-colors disabled:opacity-50">
                  {dispatching === order.id ? 'Enviando…' : 'Despachar agora'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Limpar cancelados */}
      {cancelledCount > 0 && (
        <div className="mt-4 flex items-center justify-between bg-[#FAF8F5] border border-[#E6DFD5] px-4 py-3">
          <p className="text-[12px] text-[#B09C8C]">
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
