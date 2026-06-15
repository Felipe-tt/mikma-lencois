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
    {
      label: 'Pedidos hoje',
      value: paid.filter(o => o.createdAt >= todayStr).length,
      fmt: 'n' as const,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    },
    {
      label: 'Receita hoje',
      value: paid.filter(o => o.createdAt >= todayStr).reduce((s, o) => s + o.totalCents, 0),
      fmt: 'c' as const,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
    },
    {
      label: 'Pedidos no mês',
      value: paid.filter(o => o.createdAt >= monthStr).length,
      fmt: 'n' as const,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    },
    {
      label: 'Receita no mês',
      value: paid.filter(o => o.createdAt >= monthStr).reduce((s, o) => s + o.totalCents, 0),
      fmt: 'c' as const,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    },
    {
      label: 'Aguardando pag.',
      value: waiting,
      fmt: 'n' as const,
      alert: true,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    },
  ];

  return (
    <div className="max-w-5xl">
      {/* Page header */}
      <div className="mb-8">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Visão geral</p>
        <h1 className="font-display font-normal text-[#1E1208] text-2xl">Dashboard</h1>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {kpis.map(k => (
          <div
            key={k.label}
            className={`bg-[#FAF8F5] border px-4 py-4 flex flex-col gap-3 ${
              k.alert && k.value > 0
                ? 'border-amber-200 bg-amber-50'
                : 'border-[#E6DFD5]'
            }`}
          >
            <span className={k.alert && k.value > 0 ? 'text-amber-500' : 'text-[#B09C8C]'}>{k.icon}</span>
            <div>
              <p className={`text-[10px] font-semibold tracking-[0.15em] uppercase mb-1 ${
                k.alert && k.value > 0 ? 'text-amber-600' : 'text-[#B09C8C]'
              }`}>
                {k.label}
              </p>
              <p className={`font-display text-xl leading-none ${
                k.alert && k.value > 0 ? 'text-amber-700' : 'text-[#1E1208]'
              }`}>
                {k.fmt === 'c' ? formatCurrency(k.value) : k.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-normal text-[#1E1208] text-lg">Pedidos recentes</h2>
        <Link href="/painel/pedidos" className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors tracking-wide uppercase">
          Ver todos →
        </Link>
      </div>

      {/* Table */}
      <div className="bg-[#FAF8F5] border border-[#E6DFD5] overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_140px_120px_48px] px-5 py-3 border-b border-[#E6DFD5] bg-[#F0EAE1]">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C]">Pedido / Status</span>
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] text-right">Data</span>
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] text-right">Total</span>
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C]"></span>
        </div>

        {orders.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-[#B09C8C]">Nenhum pedido ainda.</p>
        ) : orders.map((o, idx) => (
          <div
            key={o.id}
            className={`grid grid-cols-[1fr_140px_120px_48px] px-5 py-3.5 items-center hover:bg-[#F0EAE1] transition-colors ${
              idx < orders.length - 1 ? 'border-b border-[#E6DFD5]' : ''
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[11px] font-mono text-[#B09C8C] shrink-0">#{o.id.slice(-8).toUpperCase()}</span>
              <span className={BADGE[o.status] ?? 'badge'}>{LABEL[o.status] ?? o.status}</span>
            </div>
            <span className="text-[11px] text-[#B09C8C] text-right">{formatTsDateTime(o.createdAt)}</span>
            <span className="font-display text-sm text-[#1E1208] text-right">{formatCurrency(o.totalCents)}</span>
            <div className="flex justify-end">
              <Link
                href={`/painel/pedidos/${o.id}`}
                className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors"
              >
                Ver
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 sm:hidden mt-2">
        {orders.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#B09C8C]">Nenhum pedido ainda.</p>
        ) : orders.map(o => (
          <Link
            key={o.id}
            href={`/painel/pedidos/${o.id}`}
            className="block border border-[#E6DFD5] bg-[#FAF8F5] p-4 hover:bg-[#F0EAE1] transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-[#B09C8C]">#{o.id.slice(-8).toUpperCase()}</span>
              <span className={BADGE[o.status] ?? 'badge'}>{LABEL[o.status] ?? o.status}</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-[11px] text-[#B09C8C]">{formatTsDateTime(o.createdAt)}</span>
              <span className="font-display text-base text-[#1E1208]">{formatCurrency(o.totalCents)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
