'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { formatCurrency } from '@/lib/utils/format';
import type { Order } from '@/types';

interface KPIs {
  todayOrders: number;
  todayRevenue: number;
  monthOrders: number;
  monthRevenue: number;
  pendingOrders: number;
}

function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return Timestamp.fromDate(d);
}
function startOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return Timestamp.fromDate(d);
}

export default function PainelDashboard() {
  const [kpis, setKpis] = useState<KPIs>({ todayOrders: 0, todayRevenue: 0, monthOrders: 0, monthRevenue: 0, pendingOrders: 0 });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const monthQ = query(
      collection(db, 'orders'),
      where('status', '!=', 'pending_payment'),
      where('createdAt', '>=', startOfMonth()),
      orderBy('createdAt', 'desc')
    );

    const pendingQ = query(collection(db, 'orders'), where('status', '==', 'pending_payment'));
    const recentQ = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(10));

    let monthOrders: Order[] = [];
    let pendingCount = 0;

    const unsubMonth = onSnapshot(monthQ, snap => {
      monthOrders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      const todayTs = startOfToday();
      const todayOrders = monthOrders.filter(o => (o.createdAt as unknown as Timestamp) >= todayTs);
      setKpis(k => ({
        ...k,
        monthOrders: monthOrders.length,
        monthRevenue: monthOrders.reduce((a, o) => a + o.totalCents, 0),
        todayOrders: todayOrders.length,
        todayRevenue: todayOrders.reduce((a, o) => a + o.totalCents, 0),
      }));
      setLoading(false);
    });

    const unsubPending = onSnapshot(pendingQ, snap => {
      pendingCount = snap.size;
      setKpis(k => ({ ...k, pendingOrders: pendingCount }));
    });

    const unsubRecent = onSnapshot(recentQ, snap => {
      setRecentOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
    });

    return () => { unsubMonth(); unsubPending(); unsubRecent(); };
  }, []);

  const CARDS = [
    { label: 'Pedidos hoje', value: kpis.todayOrders, sub: formatCurrency(kpis.todayRevenue) },
    { label: 'Pedidos no mês', value: kpis.monthOrders, sub: formatCurrency(kpis.monthRevenue) },
    { label: 'Aguardando pagamento', value: kpis.pendingOrders, sub: 'pedidos', warn: kpis.pendingOrders > 0 },
  ];

  const STATUS_LABEL: Record<string, string> = {
    pending_payment: 'Aguardando pag.', paid: 'Pago', preparing: 'Em preparo', shipped: 'Em rota', delivered: 'Entregue',
  };
  const STATUS_COLOR: Record<string, string> = {
    pending_payment: 'text-yellow-600', paid: 'text-blue-600', preparing: 'text-purple-600', shipped: 'text-orange-600', delivered: 'text-green-600',
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center"><p className="text-sm text-gray-400">Carregando…</p></div>;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CARDS.map(card => (
          <div key={card.label} className={`rounded-lg border bg-white p-5 ${card.warn ? 'border-yellow-300' : 'border-gray-200'}`}>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{card.value}</p>
            <p className="mt-0.5 text-sm text-gray-400">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Pedidos recentes</h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {recentOrders.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-gray-400">Nenhum pedido ainda.</li>
          )}
          {recentOrders.map(order => (
            <li key={order.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">#{order.id.slice(-8).toUpperCase()}</p>
                <p className="text-xs text-gray-500">{order.items.length} iten{order.items.length !== 1 ? 's' : 's'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(order.totalCents)}</p>
                <p className={`text-xs font-medium ${STATUS_COLOR[order.status] ?? 'text-gray-500'}`}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
