'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import Link from 'next/link';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pag.',
  paid: 'Pago',
  preparing: 'Em preparo',
  shipped: 'Em rota',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const BADGE: Record<string, string> = {
  pending_payment: 'badge-pending',
  paid: 'badge-paid',
  preparing: 'badge-preparing',
  shipped: 'badge-shipped',
  delivered: 'badge-delivered',
  cancelled: 'badge-cancelled',
};

const FILTER_OPTIONS = ['todos', 'paid', 'preparing', 'shipped', 'delivered', 'pending_payment'];
const FILTER_LABEL: Record<string, string> = {
  todos: 'Todos', paid: 'Pagos', preparing: 'Em preparo',
  shipped: 'Em rota', delivered: 'Entregues', pending_payment: 'Aguardando',
};

export default function PainelPedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todos');
  const [dispatching, setDispatching] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      snap => { setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))); setLoading(false); }
    );
  }, []);

  async function markPreparing(orderId: string) {
    await updateDoc(doc(db, 'orders', orderId), { status: 'preparing', updatedAt: serverTimestamp() });
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

  const filtered = filter === 'todos' ? orders : orders.filter(o => o.status === filter);
  const [deletingCancelled, setDeletingCancelled] = useState(false);

  async function handleDeleteCancelled() {
    const cancelled = orders.filter(o => o.status === 'cancelled');
    if (!cancelled.length) return;
    if (!confirm(`Excluir ${cancelled.length} pedido(s) cancelado(s) permanentemente?`)) return;
    setDeletingCancelled(true);
    try {
      const batch = writeBatch(db);
      cancelled.forEach(o => batch.delete(doc(db, 'orders', o.id)));
      await batch.commit();
    } catch (err) {
      console.error('Erro ao excluir cancelados:', err);
      alert('Erro ao excluir pedidos. Verifique suas permissões.');
    } finally {
      setDeletingCancelled(false);
    }
  }

  const cancelledCount = orders.filter(o => o.status === 'cancelled').length;

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-7">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Gestão</p>
        <h1 className="font-display font-normal text-[#0F0E0C] text-2xl">Pedidos</h1>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5 flex-1">
          {FILTER_OPTIONS.map(f => {
            const count = f !== 'todos' ? orders.filter(o => o.status === f).length : orders.length;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase border transition-colors ${
                  filter === f
                    ? 'bg-[#0F0E0C] text-[#FAFAF8] border-[#0F0E0C]'
                    : 'bg-[#FAFAF8] text-[#6B6660] border-[#E8E4DC] hover:bg-[#F0EBE1]'
                }`}
              >
                {FILTER_LABEL[f]}
                <span className={`text-[10px] ${filter === f ? 'opacity-60' : 'opacity-50'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        {cancelledCount > 0 && (
          <button
            onClick={handleDeleteCancelled}
            disabled={deletingCancelled}
            className="shrink-0 text-[11px] font-semibold text-red-500 border border-red-200 bg-red-50 px-3 py-1.5 hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {deletingCancelled
              ? <><span className="spinner-sm border-red-400/30 border-t-red-500" />Excluindo…</>
              : `Excluir cancelados (${cancelledCount})`
            }
          </button>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block bg-[#FAFAF8] border border-[#E8E4DC] overflow-hidden">
        <div className="grid grid-cols-[1fr_150px_120px_120px_60px] px-5 py-3 border-b border-[#E8E4DC] bg-[#F5F3EF]">
          {['Pedido / Status', 'Data', 'Total', 'Ação', ''].map((h, i) => (
            <span key={i} className={`text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA] ${i >= 1 ? 'text-right' : ''} ${i === 4 ? 'sr-only' : ''}`}>{h}</span>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-[#B8B2AA]">Nenhum pedido.</p>
        ) : filtered.map((order, idx) => (
          <div
            key={order.id}
            className={`grid grid-cols-[1fr_150px_120px_120px_60px] px-5 py-3.5 items-center hover:bg-[#F5F3EF] transition-colors ${
              idx < filtered.length - 1 ? 'border-b border-[#E8E4DC]' : ''
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[11px] font-mono text-[#B8B2AA] shrink-0">#{order.id.slice(-8).toUpperCase()}</span>
              <span className={BADGE[order.status] ?? 'badge'}>{STATUS_LABEL[order.status] ?? order.status}</span>
            </div>
            <span className="text-[11px] text-[#B8B2AA] text-right">{formatTsDateTime(order.createdAt)}</span>
            <span className="font-display text-sm text-[#0F0E0C] text-right">{formatCurrency(order.totalCents)}</span>
            <div className="text-right">
              {order.status === 'paid' && (
                <button
                  onClick={() => markPreparing(order.id)}
                  className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1.5 border border-[#C4714A] text-[#C4714A] hover:bg-[#C4714A] hover:text-white transition-colors"
                >
                  Em preparo
                </button>
              )}
              {order.status === 'preparing' && (
                <button
                  onClick={() => dispatch(order.id)}
                  disabled={dispatching === order.id}
                  className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1.5 bg-[#0F0E0C] text-white hover:bg-[#0F0E0C]/80 transition-colors disabled:opacity-50"
                >
                  {dispatching === order.id ? 'Enviando…' : 'Despachar'}
                </button>
              )}
            </div>
            <div className="flex justify-end">
              <Link href={`/painel/pedidos/${order.id}`} className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors">
                Ver
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 sm:hidden">
        {filtered.length === 0 ? (
          <p className="py-14 text-center text-sm text-[#B8B2AA] border border-[#E8E4DC]">Nenhum pedido.</p>
        ) : filtered.map(order => (
          <div key={order.id} className="border border-[#E8E4DC] bg-[#FAFAF8] p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-mono text-[#B8B2AA]">#{order.id.slice(-8).toUpperCase()}</span>
              <span className={BADGE[order.status] ?? 'badge'}>{STATUS_LABEL[order.status] ?? order.status}</span>
            </div>
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-[11px] text-[#B8B2AA] mb-0.5">{formatTsDateTime(order.createdAt)}</p>
                <p className="font-display text-lg text-[#0F0E0C]">{formatCurrency(order.totalCents)}</p>
              </div>
              <Link href={`/painel/pedidos/${order.id}`} className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors">
                Ver detalhes
              </Link>
            </div>
            {order.status === 'paid' && (
              <button
                onClick={() => markPreparing(order.id)}
                className="w-full border border-[#C4714A] text-[#C4714A] text-[11px] font-bold uppercase tracking-wide py-2.5 hover:bg-[#C4714A] hover:text-white transition-colors"
              >
                Marcar em preparo
              </button>
            )}
            {order.status === 'preparing' && (
              <button
                onClick={() => dispatch(order.id)}
                disabled={dispatching === order.id}
                className="w-full bg-[#0F0E0C] text-white text-[11px] font-bold uppercase tracking-wide py-2.5 disabled:opacity-50 hover:bg-[#0F0E0C]/80 transition-colors"
              >
                {dispatching === order.id ? 'Enviando…' : 'Despachar pedido'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
