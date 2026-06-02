'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  paid: 'Pago',
  preparing: 'Em preparo',
  shipped: 'Em rota',
  delivered: 'Entregue',
};

const STATUS_COLOR: Record<string, string> = {
  pending_payment: 'bg-yellow-50 text-yellow-700',
  paid: 'bg-blue-50 text-blue-700',
  preparing: 'bg-purple-50 text-purple-700',
  shipped: 'bg-orange-50 text-orange-700',
  delivered: 'bg-green-50 text-green-700',
};

export default function PedidosPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }

    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      setOrdersLoading(false);
    });

    return unsub;
  }, [user, loading, router]);

  if (loading || ordersLoading) {
    return <div className="flex min-h-64 items-center justify-center"><p className="text-sm text-gray-400">Carregando…</p></div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Meus pedidos</h1>

      {orders.length === 0 ? (
        <p className="py-20 text-center text-gray-400">Nenhum pedido ainda.</p>
      ) : (
        <ul className="space-y-4">
          {orders.map(order => (
            <li key={order.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-400">Pedido #{order.id.slice(-8).toUpperCase()}</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900">
                    {formatCurrency(order.totalCents)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {order.createdAt
                      ? formatDateTime(new Date((order.createdAt as unknown as { seconds: number }).seconds * 1000).toISOString())
                      : '—'}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>

              <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3">
                {order.items.map(item => (
                  <li key={item.sku} className="flex justify-between text-sm text-gray-600">
                    <span>{item.productName} × {item.quantity}</span>
                    <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
              </ul>

              {order.delivery?.trackingCode && (
                <p className="mt-3 text-xs text-gray-500">
                  Rastreio: <span className="font-medium text-gray-700">{order.delivery.trackingCode}</span>
                  {' · '}{order.delivery.carrier}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
