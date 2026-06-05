'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { formatCurrency, formatDateTime, formatTsDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';
import { DashboardSkeleton } from '@/components/ui/Skeleton';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pag.', paid: 'Pago', preparing: 'Em preparo', shipped: 'Em rota', delivered: 'Entregue',
};
const STATUS_COLOR: Record<string, string> = {
  pending_payment: 'bg-yellow-50 text-yellow-700', paid: 'bg-blue-50 text-blue-700',
  preparing: 'bg-purple-50 text-purple-700', shipped: 'bg-orange-50 text-orange-700', delivered: 'bg-green-50 text-green-700',
};

const FILTER_OPTIONS = ['todos', 'paid', 'preparing', 'shipped', 'delivered', 'pending_payment'];

export default function PainelPedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todos');
  const [dispatching, setDispatching] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
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

  const filtered = filter === 'todos' ? orders : orders.filter(o => o.status === filter);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Pedidos</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {f === 'todos' ? 'Todos' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">Nenhum pedido nesse filtro.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <div key={order.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-400">#{order.id.slice(-8).toUpperCase()}</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900">{formatCurrency(order.totalCents)}</p>
                  <p className="text-xs text-gray-500">
                    {order.createdAt
                      ? formatTsDateTime(order.createdAt)
                      : '—'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>

                  {order.status === 'paid' && (
                    <button onClick={() => markPreparing(order.id)}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      Iniciar preparo
                    </button>
                  )}

                  {order.status === 'preparing' && (
                    <button onClick={() => dispatch(order.id)} disabled={dispatching === order.id}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      {dispatching === order.id ? 'Despachando…' : 'Despachar'}
                    </button>
                  )}
                </div>
              </div>

              <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3">
                {order.items.map(item => (
                  <li key={item.sku} className="flex justify-between text-sm text-gray-600">
                    <span>{item.productName} × {item.quantity} <span className="text-xs text-gray-400">({item.variant.size}{item.variant.color ? ` · ${item.variant.color}` : ''})</span></span>
                    <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
                <p>{order.address.street}, {order.address.number} — {order.address.city}/{order.address.state} · {order.address.cep}</p>
                {order.delivery?.trackingCode && (
                  <p className="mt-1">Rastreio: <span className="font-medium text-gray-700">{order.delivery.trackingCode}</span> ({order.delivery.carrier})</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
