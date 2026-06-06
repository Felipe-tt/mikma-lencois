'use client';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import type { Order } from '@/types';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import Link from 'next/link';
import { DashboardSkeleton } from '@/components/ui/Skeleton';

const BADGE: Record<string, string> = {
  pending_payment: 'badge-pending', paid: 'badge-paid', preparing: 'badge-preparing',
  shipped: 'badge-shipped', delivered: 'badge-delivered', cancelled: 'badge-cancelled',
};
const LABEL: Record<string, string> = {
  pending_payment: 'Aguardando', paid: 'Pago', preparing: 'Em preparo',
  shipped: 'Em rota', delivered: 'Entregue', cancelled: 'Cancelado',
};

export default function PainelDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(10)),
      snap => { setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))); setLoading(false); }
    );
  }, []);

  if (loading) return <DashboardSkeleton />;

  const paid = orders.filter(o => o.status !== 'pending_payment' && o.status !== 'cancelled');
  const now = new Date();
  const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const waiting = orders.filter(o => o.status === 'pending_payment').length;

  const kpis = [
    { label: 'Pedidos hoje', value: paid.filter(o => o.createdAt >= todayStr).length, fmt: 'n' },
    { label: 'Receita hoje', value: paid.filter(o => o.createdAt >= todayStr).reduce((s, o) => s + o.totalCents, 0), fmt: 'c' },
    { label: 'Pedidos no mês', value: paid.filter(o => o.createdAt >= monthStr).length, fmt: 'n' },
    { label: 'Receita no mês', value: paid.filter(o => o.createdAt >= monthStr).reduce((s, o) => s + o.totalCents, 0), fmt: 'c' },
    { label: 'Aguardando pag.', value: waiting, fmt: 'n', alert: true },
  ];

  return (
    <div>
      <div className="mb-6">
        <span className="eyebrow mb-1 block">Visão geral</span>
        <h1 className="font-display font-normal text-ink text-2xl">Dashboard</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-mist mb-8 border border-mist">
        {kpis.map(k => (
          <div key={k.label} className={`${k.alert && k.value > 0 ? 'bg-amber-50' : 'bg-paper'} px-4 py-5`}>
            <p className={`text-2xs font-bold tracking-[0.16em] uppercase mb-2 ${k.alert && k.value > 0 ? 'text-amber-600' : 'text-faint'}`}>
              {k.label}
            </p>
            <p className={`font-display text-xl ${k.alert && k.value > 0 ? 'text-amber-700' : 'text-ink'}`}>
              {k.fmt === 'c' ? formatCurrency(k.value) : k.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-normal text-ink text-lg">Pedidos recentes</h2>
        <Link href="/painel/pedidos" className="text-xs font-medium text-clay hover:text-clay-d transition-colors">Ver todos</Link>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block border border-mist">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-warm border-b border-mist">
          {['Pedido / Status', 'Data', 'Total', ''].map((h, i) => (
            <span key={i} className="text-2xs font-bold tracking-[0.18em] uppercase text-faint">{h}</span>
          ))}
        </div>
        {orders.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-faint">Nenhum pedido ainda.</p>
        ) : orders.map((o, idx) => (
          <div key={o.id} className={`grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-4 items-center ${idx < orders.length - 1 ? 'border-b border-mist' : ''} hover:bg-warm transition-colors`}>
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-mono text-faint shrink-0">#{o.id.slice(-8).toUpperCase()}</span>
              <span className={BADGE[o.status] ?? 'badge'}>{LABEL[o.status] ?? o.status}</span>
            </div>
            <span className="text-xs text-faint whitespace-nowrap">{formatTsDateTime(o.createdAt)}</span>
            <span className="font-display text-base text-ink">{formatCurrency(o.totalCents)}</span>
            <Link href={`/painel/pedidos/${o.id}`} className="text-xs font-semibold text-clay hover:text-clay-d transition-colors">Ver</Link>
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {orders.length === 0 ? (
          <p className="py-10 text-center text-sm text-faint">Nenhum pedido ainda.</p>
        ) : orders.map(o => (
          <Link key={o.id} href={`/painel/pedidos/${o.id}`} className="block border border-mist bg-paper p-4 hover:bg-warm transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-faint">#{o.id.slice(-8).toUpperCase()}</span>
              <span className={BADGE[o.status] ?? 'badge'}>{LABEL[o.status] ?? o.status}</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-xs text-faint">{formatTsDateTime(o.createdAt)}</span>
              <span className="font-display text-base text-ink">{formatCurrency(o.totalCents)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
