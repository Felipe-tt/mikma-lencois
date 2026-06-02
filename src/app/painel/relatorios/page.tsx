'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Order } from '@/types';

type Period = '7d' | '30d' | '90d';

type Stats = {
  revenue: number;
  orders: number;
  avgTicket: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  byCarrier: { name: string; count: number }[];
};

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const q = query(
        collection(db, 'orders'),
        where('status', '==', 'delivered'),
        where('createdAt', '>=', Timestamp.fromDate(since)),
        orderBy('createdAt', 'desc')
      );

      const snap = await getDocs(q);
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));

      const revenue = orders.reduce((s, o) => s + o.totalCents, 0);
      const avgTicket = orders.length ? revenue / orders.length : 0;

      // top products
      const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      for (const order of orders) {
        for (const item of order.items) {
          if (!productMap[item.productId]) {
            productMap[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
          }
          productMap[item.productId].qty += item.quantity;
          productMap[item.productId].revenue += item.unitPrice * item.quantity;
        }
      }
      const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

      // by carrier
      const carrierMap: Record<string, number> = {};
      for (const order of orders) {
        const c = order.delivery?.carrier ?? 'Desconhecido';
        carrierMap[c] = (carrierMap[c] ?? 0) + 1;
      }
      const byCarrier = Object.entries(carrierMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

      setStats({ revenue, orders: orders.length, avgTicket, topProducts, byCarrier });
      setLoading(false);
    };
    load();
  }, [period]);

  const fmt = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Relatórios</h1>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors border ${
                period === p
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Carregando...</div>
      ) : !stats ? null : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-sm text-gray-500 mb-1">Receita bruta</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(stats.revenue)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-sm text-gray-500 mb-1">Pedidos entregues</p>
              <p className="text-2xl font-bold text-gray-900">{stats.orders}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-sm text-gray-500 mb-1">Ticket médio</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(stats.avgTicket)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-medium text-gray-700 mb-4">Produtos mais vendidos</h2>
              {stats.topProducts.length === 0 ? (
                <p className="text-sm text-gray-400">Sem dados.</p>
              ) : (
                <div className="space-y-2">
                  {stats.topProducts.map((p, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="text-gray-700 truncate mr-2">{p.name}</span>
                      <div className="flex gap-3 shrink-0">
                        <span className="text-gray-500">{p.qty} un.</span>
                        <span className="font-medium text-gray-900">{fmt(p.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-medium text-gray-700 mb-4">Entregas por transportadora</h2>
              {stats.byCarrier.length === 0 ? (
                <p className="text-sm text-gray-400">Sem dados.</p>
              ) : (
                <div className="space-y-2">
                  {stats.byCarrier.map((c, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-700">{c.name}</span>
                      <span className="font-medium text-gray-900">{c.count} pedidos</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
