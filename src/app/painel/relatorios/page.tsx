'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Order } from '@/types';

type Period = '7d' | '30d' | '90d';
type Stats = {
  revenue: number; orders: number; avgTicket: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  byCarrier: { name: string; count: number }[];
};

const fmt = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PERIODS: { id: Period; label: string; desc: string }[] = [
  { id: '7d',  label: 'Últimos 7 dias',  desc: 'Esta semana' },
  { id: '30d', label: 'Últimos 30 dias', desc: 'Este mês' },
  { id: '90d', label: 'Últimos 90 dias', desc: 'Este trimestre' },
];

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const since = new Date(); since.setDate(since.getDate() - days);
      const snap = await getDocs(query(
        collection(db, 'orders'),
        where('status', 'in', ['paid', 'preparing', 'shipped', 'delivered']),
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
        const c = order.delivery?.carrier ?? 'Não informado';
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
      <div className="mb-6">
        <h1 className="font-display font-normal text-[#1E1208] text-2xl">Relatórios</h1>
        <p className="text-[13px] text-[#B09C8C] mt-1">Veja como sua loja está se saindo ao longo do tempo.</p>
      </div>

      {/* Seletor de período */}
      <div className="flex gap-2 mb-6">
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`flex-1 sm:flex-none px-4 py-2.5 text-[12px] font-semibold border transition-colors ${
              period === p.id ? 'bg-[#1E1208] text-[#FAF8F5] border-[#1E1208]' : 'border-[#E6DFD5] text-[#705A48] bg-[#FAF8F5] hover:bg-[#F0EBE1]'
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">{[1,2,3].map(i => <div key={i} className="h-24 skeleton border border-mist" />)}</div>
          <div className="h-48 skeleton border border-mist" />
        </div>
      ) : !stats ? null : (
        <div className="flex flex-col gap-4">

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: '💰', label: 'Total faturado', value: fmt(stats.revenue), desc: 'soma de todos os pedidos pagos' },
              { icon: '📦', label: 'Pedidos entregues', value: String(stats.orders), desc: 'pedidos concluídos no período' },
              { icon: '🧾', label: 'Valor médio por pedido', value: fmt(stats.avgTicket), desc: 'quanto cada cliente gastou em média' },
            ].map(k => (
              <div key={k.label} className="bg-[#FAF8F5] border border-[#E6DFD5] px-5 py-4">
                <span className="text-2xl mb-2 block">{k.icon}</span>
                <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#B09C8C] mb-1">{k.label}</p>
                <p className="font-display text-2xl text-[#1E1208] leading-none">{k.value}</p>
                <p className="text-[10px] text-[#B09C8C] mt-1">{k.desc}</p>
              </div>
            ))}
          </div>

          {/* Top produtos */}
          <div className="bg-[#FAF8F5] border border-[#E6DFD5]">
            <div className="px-5 py-4 border-b border-[#E6DFD5]">
              <p className="text-[13px] font-bold text-[#1E1208]">🏆 Produtos mais vendidos</p>
              <p className="text-[11px] text-[#B09C8C] mt-0.5">Os produtos que mais geraram receita no período</p>
            </div>
            {stats.topProducts.length === 0 ? (
              <p className="text-sm text-[#B09C8C] py-10 text-center">Sem vendas no período selecionado.</p>
            ) : stats.topProducts.map((p, i) => {
              const maxRevenue = stats.topProducts[0].revenue;
              const pct = maxRevenue > 0 ? (p.revenue / maxRevenue) * 100 : 0;
              return (
                <div key={i} className={`px-5 py-4 ${i < stats.topProducts.length - 1 ? 'border-b border-[#E6DFD5]' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] font-bold text-[#B09C8C]/60 w-5">{i + 1}</span>
                      <span className="text-[13px] text-[#1E1208] font-medium">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-[#B09C8C]">{p.qty} un.</span>
                      <span className="text-[13px] font-semibold text-[#1E1208]">{fmt(p.revenue)}</span>
                    </div>
                  </div>
                  <div className="h-1 bg-[#E6DFD5] overflow-hidden">
                    <div className="h-full bg-[#C4714A]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Por transportadora */}
          {stats.byCarrier.length > 0 && (
            <div className="bg-[#FAF8F5] border border-[#E6DFD5]">
              <div className="px-5 py-4 border-b border-[#E6DFD5]">
                <p className="text-[13px] font-bold text-[#1E1208]">🚚 Como os pedidos foram entregues</p>
                <p className="text-[11px] text-[#B09C8C] mt-0.5">Qual método de entrega foi mais usado</p>
              </div>
              {stats.byCarrier.map((c, i) => (
                <div key={i} className={`flex justify-between items-center px-5 py-3.5 ${i < stats.byCarrier.length - 1 ? 'border-b border-[#E6DFD5]' : ''}`}>
                  <span className="text-[13px] text-[#1E1208]">{c.name}</span>
                  <span className="text-[13px] font-semibold text-[#705A48]">{c.count} pedido{c.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}

          {stats.orders === 0 && (
            <div className="bg-[#FAF8F5] border border-[#E6DFD5] py-12 text-center">
              <p className="text-4xl mb-3">📊</p>
              <p className="text-[13px] text-[#B09C8C]">Não houve vendas nos {period === '7d' ? '7' : period === '30d' ? '30' : '90'} dias selecionados.<br />Experimente selecionar um período maior.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
