'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import Link from 'next/link';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  paid: 'Pago — precisa separar',
  preparing: 'Separando',
  shipped: 'A caminho do cliente',
  delivered: 'Entregue ✓',
  cancelled: 'Cancelado',
};

const BADGE: Record<string, string> = {
  pending_payment: 'badge-pending', paid: 'badge-paid', preparing: 'badge-preparing',
  shipped: 'badge-shipped', delivered: 'badge-delivered', cancelled: 'badge-cancelled',
};

const FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'paid', label: '🔴 Precisam de atenção' },
  { id: 'preparing', label: '📦 Separando' },
  { id: 'shipped', label: '🚚 A caminho' },
  { id: 'delivered', label: '✓ Entregues' },
  { id: 'pending_payment', label: '⏳ Aguardando pagamento' },
];

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

  async function handleDeleteCancelled() {
    const cancelled = orders.filter(o => o.status === 'cancelled');
    if (!cancelled.length) return;
    if (!confirm(`Tem certeza que quer apagar os ${cancelled.length} pedidos cancelados? Esta ação não pode ser desfeita.`)) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/orders/delete-cancelled', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    } catch { alert('Ocorreu um erro. Tente novamente.'); }
  }

  const filtered = filter === 'todos' ? orders : orders.filter(o => o.status === filter);
  const cancelledCount = orders.filter(o => o.status === 'cancelled').length;
  const needActionCount = orders.filter(o => o.status === 'paid').length;

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display font-normal text-[#1E1208] text-2xl">Pedidos</h1>
        <p className="text-[13px] text-[#B09C8C] mt-1">Aqui você vê e gerencia todos os pedidos da loja.</p>
      </div>

      {needActionCount > 0 && (
        <div className="bg-[#C4714A]/10 border border-[#C4714A]/30 px-4 py-3 mb-5 flex items-center gap-3">
          <span className="text-xl">🔴</span>
          <p className="text-[13px] text-[#1E1208]">
            <strong>{needActionCount} {needActionCount === 1 ? 'pedido pago' : 'pedidos pagos'}</strong> esperando você separar.
            <button onClick={() => setFilter('paid')} className="ml-2 text-[#C4714A] font-semibold underline">Ver agora</button>
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
        {FILTERS.map(f => {
          const count = f.id === 'todos' ? orders.length : orders.filter(o => o.status === f.id).length;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold border transition-colors ${
                filter === f.id ? 'bg-[#1E1208] text-[#FAF8F5] border-[#1E1208]' : 'bg-[#FAF8F5] text-[#705A48] border-[#E6DFD5] hover:bg-[#F0EBE1]'
              }`}>
              {f.label}
              <span className={`text-[10px] ${filter === f.id ? 'opacity-50' : 'opacity-40'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <div className="bg-[#FAF8F5] border border-[#E6DFD5] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-sm text-[#B09C8C]">Nenhum pedido nessa categoria.</p>
          </div>
        ) : filtered.map((order, idx) => (
          <div key={order.id} className={`px-5 py-4 hover:bg-[#F0EAE1] transition-colors ${idx < filtered.length - 1 ? 'border-b border-[#E6DFD5]' : ''}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-mono text-[#B09C8C]">#{order.id.slice(-6).toUpperCase()}</span>
                <span className={BADGE[order.status] ?? 'badge'}>{STATUS_LABEL[order.status] ?? order.status}</span>
                <span className="font-display text-sm text-[#1E1208]">{formatCurrency(order.totalCents)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[#B09C8C]">{formatTsDateTime(order.createdAt)}</span>
                <Link href={`/painel/pedidos/${order.id}`} className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors">Ver detalhes →</Link>
              </div>
            </div>

            {/* Ações */}
            {order.status === 'paid' && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-[#C4714A]/5 border border-[#C4714A]/20">
                <span className="text-[13px]">👉</span>
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-[#1E1208]">Este pedido foi pago e está esperando você!</p>
                  <p className="text-[11px] text-[#B09C8C]">Clique em &quot;Comecei a separar&quot; quando estiver preparando o pedido.</p>
                </div>
                <button onClick={() => markPreparing(order.id)}
                  className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-4 py-2 bg-[#C4714A] text-white hover:bg-[#A05432] transition-colors">
                  Comecei a separar
                </button>
              </div>
            )}

            {order.status === 'preparing' && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-[#1E1208]/5 border border-[#1E1208]/10">
                <span className="text-[13px]">📦</span>
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-[#1E1208]">Pedido sendo separado</p>
                  <p className="text-[11px] text-[#B09C8C]">Quando estiver embalado e pronto para sair, clique em &quot;Despachar&quot;.</p>
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

      {cancelledCount > 0 && (
        <div className="mt-4 flex items-center justify-between bg-[#FAF8F5] border border-[#E6DFD5] px-4 py-3">
          <p className="text-[12px] text-[#B09C8C]">Você tem <strong>{cancelledCount} pedido{cancelledCount !== 1 ? 's' : ''} cancelado{cancelledCount !== 1 ? 's' : ''}</strong> na lista.</p>
          <button onClick={handleDeleteCancelled} className="text-[11px] font-semibold text-red-400 hover:text-red-600 transition-colors">
            Limpar pedidos cancelados
          </button>
        </div>
      )}
    </div>
  );
}
