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

const fmt = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Análise</p>
          <h1 className="font-display font-normal text-[#0F0E0C] text-2xl">Relatórios</h1>
        </div>
        <div className="flex gap-1.5">
          {(['7d', '30d', '90d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-[11px] px-3 py-1.5 font-semibold tracking-wide transition-colors border ${
                period === p
                  ? 'bg-[#0F0E0C] text-[#FAFAF8] border-[#0F0E0C]'
                  : 'border-[#E8E4DC] text-[#6B6660] bg-[#FAFAF8] hover:bg-[#F0EBE1]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-[#F0EBE1] animate-pulse border border-[#E8E4DC]" />)}
          </div>
          <div className="h-48 bg-[#F0EBE1] animate-pulse border border-[#E8E4DC]" />
          <div className="h-32 bg-[#F0EBE1] animate-pulse border border-[#E8E4DC]" />
        </div>
      ) : !stats ? null : (
        <div className="flex flex-col gap-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Receita bruta', value: fmt(stats.revenue), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
              { label: 'Pedidos entregues', value: String(stats.orders), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
              { label: 'Ticket médio', value: fmt(stats.avgTicket), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, span: true },
            ].map(k => (
              <div key={k.label} className={`bg-[#FAFAF8] border border-[#E8E4DC] px-4 py-4 flex flex-col gap-3 ${k.span ? 'col-span-2 sm:col-span-1' : ''}`}>
                <span className="text-[#B8B2AA]">{k.icon}</span>
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[#B8B2AA] mb-1">{k.label}</p>
                  <p className="font-display text-xl text-[#0F0E0C]">{k.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Top products */}
          <div className="bg-[#FAFAF8] border border-[#E8E4DC]">
            <div className="px-5 py-3 border-b border-[#E8E4DC] bg-[#F5F3EF]">
              <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA]">Produtos mais vendidos</h2>
            </div>
            {stats.topProducts.length === 0 ? (
              <p className="text-sm text-[#B8B2AA] py-10 text-center">Sem dados para o período.</p>
            ) : (
              <div>
                {stats.topProducts.map((p, i) => (
                  <div key={i} className={`flex items-center justify-between px-5 py-3.5 gap-4 ${i < stats.topProducts.length - 1 ? 'border-b border-[#E8E4DC]' : ''} hover:bg-[#F5F3EF] transition-colors`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-display text-sm text-[#B8B2AA]/60 shrink-0 w-5 text-center">{i + 1}</span>
                      <span className="text-sm text-[#0F0E0C] truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-[11px] text-[#B8B2AA]">{p.qty} un.</span>
                      <span className="text-sm font-semibold text-[#0F0E0C] min-w-[80px] text-right">{fmt(p.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* By carrier */}
          {stats.byCarrier.length > 0 && (
            <div className="bg-[#FAFAF8] border border-[#E8E4DC]">
              <div className="px-5 py-3 border-b border-[#E8E4DC] bg-[#F5F3EF]">
                <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA]">Entregas por transportadora</h2>
              </div>
              {stats.byCarrier.map((c, i) => (
                <div key={i} className={`flex justify-between items-center px-5 py-3.5 ${i < stats.byCarrier.length - 1 ? 'border-b border-[#E8E4DC]' : ''} hover:bg-[#F5F3EF] transition-colors`}>
                  <span className="text-sm text-[#0F0E0C]">{c.name}</span>
                  <span className="text-sm font-semibold text-[#6B6660]">{c.count} pedidos</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
