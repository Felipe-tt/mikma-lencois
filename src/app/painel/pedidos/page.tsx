'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';
import { DashboardSkeleton } from '@/components/ui/Skeleton';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pag.',
  paid: 'Pago',
  preparing: 'Em preparo',
  shipped: 'Em rota',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};
const STATUS_COLOR: Record<string, string> = {
  pending_payment: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  paid: 'bg-blue-50 text-blue-700 border-blue-200',
  preparing: 'bg-purple-50 text-purple-700 border-purple-200',
  shipped: 'bg-orange-50 text-orange-700 border-orange-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-warm text-faint border-mist',
};

const FILTER_OPTIONS = ['todos', 'paid', 'preparing', 'shipped', 'delivered', 'pending_payment'];

export default function PainelPedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todos');
  const [dispatching, setDispatching] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order)));
      setLoading(false);
    });
    return unsub;
  }, []);

  async function markPreparing(orderId: string) {
    await updateDoc(doc(db, 'orders', orderId), { status: 'preparing', updatedAt: serverTimestamp() });
  }

  async function dispatch(orderId: string) {
    setDispatching(orderId);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      console.error('dispatch error:', err);
    } finally {
      setDispatching(null);
    }
  }

  const filtered = filter === 'todos' ? orders : orders.filter((o) => o.status === filter);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="px-4 py-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display font-normal text-ink text-xl sm:text-2xl">Pedidos</h1>
        <span className="text-xs text-faint">{orders.length} total</span>
      </div>

      {/* Filtros — scroll horizontal */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 -mx-4 px-4 scrollbar-none">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
              filter === f
                ? 'bg-ink text-paper border-ink'
                : 'bg-paper border-mist text-mid hover:bg-warm'
            }`}
          >
            {f === 'todos' ? 'Todos' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center rounded-xl border border-mist">
          <p className="text-sm text-faint">Nenhum pedido nesse filtro.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((order) => (
            <div key={order.id} className="rounded-xl border border-mist bg-paper p-4">
              {/* Top row */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="text-xs font-mono text-faint mb-0.5">#{order.id.slice(-8).toUpperCase()}</p>
                  <p className="font-display text-lg text-ink leading-none">{formatCurrency(order.totalCents)}</p>
                  <p className="text-xs text-faint mt-1">{order.createdAt ? formatTsDateTime(order.createdAt) : '—'}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_COLOR[order.status] ?? 'bg-warm text-mid border-mist'}`}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>

              {/* Items */}
              <div className="border-t border-mist pt-3 mb-3 flex flex-col gap-1.5">
                {order.items.map((item) => (
                  <div key={item.sku} className="flex justify-between text-sm">
                    <span className="text-mid truncate mr-2">
                      {item.productName} <span className="text-xs text-faint">×{item.quantity}</span>
                      {item.variant.size && <span className="text-xs text-faint"> · {item.variant.size}</span>}
                    </span>
                    <span className="text-ink font-medium shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {/* Endereço */}
              <p className="text-xs text-faint border-t border-mist pt-2.5">
                {order.address.street}, {order.address.number} — {order.address.city}/{order.address.state}
              </p>
              {order.delivery?.trackingCode && (
                <p className="text-xs text-faint mt-0.5">
                  Rastreio: <span className="font-medium text-mid">{order.delivery.trackingCode}</span>
                </p>
              )}

              {/* Ações */}
              {(order.status === 'paid' || order.status === 'preparing') && (
                <div className="mt-3 pt-3 border-t border-mist">
                  {order.status === 'paid' && (
                    <button
                      onClick={() => markPreparing(order.id)}
                      className="w-full py-2.5 rounded-lg border border-mist text-sm font-medium text-mid hover:bg-warm transition-colors"
                    >
                      Iniciar preparo
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button
                      onClick={() => dispatch(order.id)}
                      disabled={dispatching === order.id}
                      className="w-full py-2.5 rounded-lg bg-clay text-paper text-sm font-semibold hover:bg-clay/80 disabled:opacity-50 transition-colors"
                    >
                      {dispatching === order.id ? 'Despachando…' : 'Despachar pedido'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
