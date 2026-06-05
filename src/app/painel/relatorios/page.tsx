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
        <h1 className="text-xl font-semibold text-ink">Relatórios</h1>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-sm px-3 py-1.5  font-medium transition-colors border ${
                period === p
                  ? 'bg-clay text-paper border-clay'
                  : 'border-mist text-mid hover:bg-warm'
              }`}
            >
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-faint"></div>
      ) : !stats ? null : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-paper border border-mist  p-5">
              <p className="text-sm text-faint mb-1">Receita bruta</p>
              <p className="text-2xl font-bold text-ink">{fmt(stats.revenue)}</p>
            </div>
            <div className="bg-paper border border-mist  p-5">
              <p className="text-sm text-faint mb-1">Pedidos entregues</p>
              <p className="text-2xl font-bold text-ink">{stats.orders}</p>
            </div>
            <div className="bg-paper border border-mist  p-5">
              <p className="text-sm text-faint mb-1">Ticket médio</p>
              <p className="text-2xl font-bold text-ink">{fmt(stats.avgTicket)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-paper border border-mist  p-5">
              <h2 className="text-sm font-medium text-mid mb-4">Produtos mais vendidos</h2>
              {stats.topProducts.length === 0 ? (
                <p className="text-sm text-faint">Sem dados.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {stats.topProducts.map((p, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="text-mid truncate mr-2">{p.name}</span>
                      <div className="flex gap-3 shrink-0">
                        <span className="text-faint">{p.qty} un.</span>
                        <span className="font-medium text-ink">{fmt(p.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-paper border border-mist  p-5">
              <h2 className="text-sm font-medium text-mid mb-4">Entregas por transportadora</h2>
              {stats.byCarrier.length === 0 ? (
                <p className="text-sm text-faint">Sem dados.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {stats.byCarrier.map((c, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-mid">{c.name}</span>
                      <span className="font-medium text-ink">{c.count} pedidos</span>
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
