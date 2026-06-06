'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
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

  if (loading) return <DashboardSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <span className="eyebrow mb-1 block">Gestão</span>
        <h1 className="font-display font-normal text-ink text-2xl">Pedidos</h1>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 mb-5">
        {FILTER_OPTIONS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`shrink-0 px-4 py-2 text-xs font-semibold tracking-wide uppercase border transition-colors ${
              filter === f ? 'bg-ink text-paper border-ink' : 'bg-paper text-mid border-mist hover:bg-warm'
            }`}>
            {FILTER_LABEL[f]}
            {f !== 'todos' && (
              <span className="ml-1.5 opacity-60">{orders.filter(o => o.status === f).length}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-faint border border-mist">Nenhum pedido.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(order => (
            <div key={order.id} className="border border-mist bg-paper p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-mono text-faint">#{order.id.slice(-8).toUpperCase()}</span>
                <span className={BADGE[order.status] ?? 'badge'}>{STATUS_LABEL[order.status] ?? order.status}</span>
              </div>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-xs text-faint mb-0.5">{formatTsDateTime(order.createdAt)}</p>
                  <p className="font-display text-lg text-ink">{formatCurrency(order.totalCents)}</p>
                </div>
                <Link href={`/painel/pedidos/${order.id}`}
                  className="text-xs font-semibold text-clay hover:text-clay-d transition-colors">
                  Ver detalhes
                </Link>
              </div>
              {(order.status === 'paid') && (
                <button onClick={() => markPreparing(order.id)}
                  className="w-full border border-clay text-clay text-xs font-semibold py-2 hover:bg-clay hover:text-paper transition-colors">
                  Marcar em preparo
                </button>
              )}
              {order.status === 'preparing' && (
                <button onClick={() => dispatch(order.id)} disabled={dispatching === order.id}
                  className="w-full bg-ink text-paper text-xs font-semibold py-2.5 disabled:opacity-50 hover:bg-ink/80 transition-colors">
                  {dispatching === order.id ? 'Enviando…' : 'Despachar pedido'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
