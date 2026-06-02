'use client';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { Order } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import Link from 'next/link';

interface KPIs { todayOrders: number; todayRevenue: number; monthOrders: number; monthRevenue: number; pendingOrders: number; }

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Aguardando', paid: 'Pago', preparing: 'Em preparo',
  shipped: 'Em rota', delivered: 'Entregue', cancelled: 'Cancelado',
};
const STATUS_CLS: Record<string, string> = {
  pending_payment: 'bg-amber-50 text-amber-700',
  paid:            'bg-green-50 text-green-700',
  preparing:       'bg-blue-50 text-blue-700',
  shipped:         'bg-purple-50 text-purple-700',
  delivered:       'bg-green-50 text-green-700',
  cancelled:       'bg-red-50 text-red-700',
};

export default function PainelDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [kpis, setKpis] = useState<KPIs>({ todayOrders: 0, todayRevenue: 0, monthOrders: 0, monthRevenue: 0, pendingOrders: 0 });

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(10));
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(all);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const paid = all.filter(o => o.status !== 'pending_payment' && o.status !== 'cancelled');
      setKpis({
        todayOrders: paid.filter(o => o.createdAt >= todayStart).length,
        todayRevenue: paid.filter(o => o.createdAt >= todayStart).reduce((s, o) => s + o.totalCents, 0),
        monthOrders: paid.filter(o => o.createdAt >= monthStart).length,
        monthRevenue: paid.filter(o => o.createdAt >= monthStart).reduce((s, o) => s + o.totalCents, 0),
        pendingOrders: all.filter(o => o.status === 'pending_payment').length,
      });
    });
  }, []);

  const kpiCards = [
    { label: 'Pedidos hoje', value: kpis.todayOrders, fmt: 'n' as const },
    { label: 'Receita hoje', value: kpis.todayRevenue, fmt: 'c' as const },
    { label: 'Pedidos no mês', value: kpis.monthOrders, fmt: 'n' as const },
    { label: 'Receita no mês', value: kpis.monthRevenue, fmt: 'c' as const },
    { label: 'Aguardando pag.', value: kpis.pendingOrders, fmt: 'n' as const, alert: kpis.pendingOrders > 0 },
  ];

  return (
    <div>
      <div className="border-b border-cream-dark pb-5 mb-8">
        <p className="section-label mb-1">Visão geral</p>
        <h1 className="font-display font-light text-[30px] text-ink">Dashboard</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-cream-dark mb-10">
        {kpiCards.map(k => (
          <div key={k.label} className={`flex flex-col gap-2 px-5 py-6 ${k.alert ? 'bg-amber-50' : 'bg-paper'}`}>
            <p className={`text-[10px] font-semibold tracking-[0.14em] uppercase ${k.alert ? 'text-amber-700' : 'text-ink-light'}`}>
              {k.label}
            </p>
            <p className={`font-display text-[26px] ${k.alert ? 'text-amber-700' : 'text-ink'}`}>
              {k.fmt === 'c' ? formatCurrency(k.value) : k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Pedidos recentes */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <p className="font-display text-[20px] text-ink">Pedidos recentes</p>
          <Link href="/painel/pedidos" className="text-[12px] text-ink-light no-underline hover:text-ink transition-colors">Ver todos →</Link>
        </div>

        <div className="border border-cream-dark overflow-hidden">
          <div className="grid grid-cols-[130px_1fr_110px_110px_60px] bg-cream border-b border-cream-dark px-4 py-2.5">
            {['Pedido', 'Status', 'Data', 'Total', ''].map((h, i) => (
              <span key={i} className="text-[10px] font-semibold tracking-[0.12em] uppercase text-ink-light">{h}</span>
            ))}
          </div>

          {orders.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-ink-light">Nenhum pedido ainda.</div>
          ) : orders.map((order, idx) => (
            <div key={order.id} className={`grid grid-cols-[130px_1fr_110px_110px_60px] items-center px-4 py-3.5 ${idx < orders.length - 1 ? 'border-b border-cream-dark' : ''} hover:bg-cream/40 transition-colors`}>
              <span className="text-[12px] font-mono text-ink-mid">#{order.id.slice(-8).toUpperCase()}</span>
              <span className={`badge text-[11px] ${STATUS_CLS[order.status] ?? 'bg-gray-50 text-gray-600'}`}>
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
              <span className="text-[12px] text-ink-light">{formatDate(order.createdAt)}</span>
              <span className="font-display text-[15px] text-ink">{formatCurrency(order.totalCents)}</span>
              <Link href={`/painel/pedidos/${order.id}`} className="text-[12px] text-warm-dark no-underline font-medium hover:text-ink transition-colors">
                Ver →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
