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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper border border-mist rounded-xl p-4">
      <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint mb-2">{label}</p>
      <p className="font-display text-2xl text-ink">{value}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-mist/40 animate-pulse" />)}
      </div>
      <div className="h-48 rounded-xl bg-mist/40 animate-pulse" />
      <div className="h-32 rounded-xl bg-mist/40 animate-pulse" />
    </div>
  );
}

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

      const snap = await getDocs(query(
        collection(db, 'orders'),
        where('status', '==', 'delivered'),
        where('createdAt', '>=', Timestamp.fromDate(since)),
        orderBy('createdAt', 'desc'),
      ));
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));

      const revenue = orders.reduce((s, o) => s + o.totalCents, 0);
      const avgTicket = orders.length ? revenue / orders.length : 0;

      const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      for (const order of orders) {
        for (const item of order.items) {
          if (!productMap[item.productId]) productMap[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
          productMap[item.productId].qty += item.quantity;
          productMap[item.productId].revenue += item.unitPrice * item.quantity;
        }
      }
      const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Relatórios</h1>
        {/* Filtro de período — scroll horizontal no mobile */}
        <div className="flex gap-1.5">
          {(['7d', '30d', '90d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors border ${
                period === p ? 'bg-ink text-paper border-ink' : 'border-mist text-mid hover:bg-warm'
              }`}
            >
              {p === '7d' ? '7d' : p === '30d' ? '30d' : '90d'}
            </button>
          ))}
        </div>
      </div>

      {loading ? <LoadingSkeleton /> : !stats ? null : (
        <div className="flex flex-col gap-4">
          {/* KPIs — 2 cols mobile, 3 desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Receita bruta" value={fmt(stats.revenue)} />
            <StatCard label="Pedidos entregues" value={String(stats.orders)} />
            <div className="col-span-2 sm:col-span-1">
              <StatCard label="Ticket médio" value={fmt(stats.avgTicket)} />
            </div>
          </div>

          {/* Produtos mais vendidos */}
          <div className="bg-paper border border-mist rounded-xl p-4">
            <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-4">Produtos mais vendidos</h2>
            {stats.topProducts.length === 0 ? (
              <p className="text-sm text-faint py-4 text-center">Sem dados para o período.</p>
            ) : (
              <div className="flex flex-col divide-y divide-mist">
                {stats.topProducts.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-3 gap-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-display text-sm text-faint/60 shrink-0 w-4">{i + 1}</span>
                      <span className="text-sm text-ink truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      <span className="text-faint">{p.qty} un.</span>
                      <span className="font-semibold text-ink">{fmt(p.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Por transportadora */}
          {stats.byCarrier.length > 0 && (
            <div className="bg-paper border border-mist rounded-xl p-4">
              <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-4">Entregas por transportadora</h2>
              <div className="flex flex-col divide-y divide-mist">
                {stats.byCarrier.map((c, i) => (
                  <div key={i} className="flex justify-between items-center py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm text-ink">{c.name}</span>
                    <span className="text-sm font-semibold text-mid">{c.count} pedidos</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
