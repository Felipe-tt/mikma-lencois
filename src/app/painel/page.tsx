'use client';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import type { Order } from '@/types';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import Link from 'next/link';
import { DashboardSkeleton } from '@/components/ui/Skeleton';

const BADGE: Record<string, string> = {
  pending_payment: 'badge-pending',
  paid: 'badge-paid',
  preparing: 'badge-preparing',
  shipped: 'badge-shipped',
  delivered: 'badge-delivered',
  cancelled: 'badge-cancelled',
};
const LABEL: Record<string, string> = {
  pending_payment: 'Aguardando',
  paid: 'Pago',
  preparing: 'Em preparo',
  shipped: 'Em rota',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export default function PainelDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(10)),
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order)));
        setLoadingOrders(false);
      },
    );
  }, []);

  if (loadingOrders) return <DashboardSkeleton />;

  const paid = orders.filter((o) => o.status !== 'pending_payment' && o.status !== 'cancelled');
  const now = new Date();
  const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const kpis = [
    { label: 'Pedidos hoje', value: paid.filter((o) => o.createdAt >= todayStr).length, fmt: 'n' },
    { label: 'Receita hoje', value: paid.filter((o) => o.createdAt >= todayStr).reduce((s, o) => s + o.totalCents, 0), fmt: 'c' },
    { label: 'Pedidos no mês', value: paid.filter((o) => o.createdAt >= monthStr).length, fmt: 'n' },
    { label: 'Receita no mês', value: paid.filter((o) => o.createdAt >= monthStr).reduce((s, o) => s + o.totalCents, 0), fmt: 'c' },
    { label: 'Aguardando pag.', value: orders.filter((o) => o.status === 'pending_payment').length, fmt: 'n', alert: true },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 pb-5 border-b border-mist">
        <span className="eyebrow mb-1.5 block">Visão geral</span>
        <h1 className="font-display font-normal text-ink text-2xl sm:text-3xl">Dashboard</h1>
      </div>

      {/* KPIs — 2 cols mobile, 5 cols large */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`rounded-xl border p-4 ${
              k.alert && k.value > 0
                ? 'border-amber-200 bg-amber-50'
                : 'border-mist bg-paper'
            }`}
          >
            <p className={`text-2xs font-bold tracking-[0.15em] uppercase mb-2 ${k.alert && k.value > 0 ? 'text-amber-600' : 'text-faint'}`}>
              {k.label}
            </p>
            <p className={`font-display text-xl sm:text-2xl ${k.alert && k.value > 0 ? 'text-amber-700' : 'text-ink'}`}>
              {k.fmt === 'c' ? formatCurrency(k.value) : k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Pedidos recentes */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-normal text-ink text-lg sm:text-xl">Pedidos recentes</h2>
        <Link href="/painel/pedidos" className="text-xs font-medium text-mid hover:text-clay transition-colors">
          Ver todos
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="py-16 text-center text-sm text-faint rounded-xl border border-mist">
          Nenhum pedido ainda.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/painel/pedidos/${o.id}`}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-mist bg-paper hover:bg-warm transition-colors"
            >
              {/* ID + status */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-faint">#{o.id.slice(-8).toUpperCase()}</span>
                  <span className={BADGE[o.status] ?? 'badge badge-default'}>{LABEL[o.status] ?? o.status}</span>
                </div>
                <p className="text-xs text-faint">{formatTsDateTime(o.createdAt)}</p>
              </div>
              {/* Total */}
              <span className="font-display text-base text-ink shrink-0">{formatCurrency(o.totalCents)}</span>
              {/* Arrow */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-faint shrink-0">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
