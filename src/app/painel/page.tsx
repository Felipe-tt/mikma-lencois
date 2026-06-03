'use client';
import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Order } from '@/types';
import Link from 'next/link';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending_payment: { label: 'Aguardando pag.', cls: 'badge-pending' },
  paid:            { label: 'Pago',            cls: 'badge-paid' },
  preparing:       { label: 'Em preparo',      cls: 'badge-default' },
  shipped:         { label: 'Em rota',         cls: 'badge badge-default' },
  delivered:       { label: 'Entregue',        cls: 'badge-paid' },
  cancelled:       { label: 'Cancelado',       cls: 'badge-canceled' },
};

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(20)),
      snap => { setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))); setLoading(false); }
    );
  }, []);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const paid = orders.filter(o => o.status !== 'pending_payment' && o.status !== 'cancelled');

  const kpis = [
    { label: 'Hoje — pedidos', value: paid.filter(o => o.createdAt >= startOfDay).length, format: 'n' as const },
    { label: 'Hoje — receita', value: paid.filter(o => o.createdAt >= startOfDay).reduce((s, o) => s + o.totalCents, 0), format: 'c' as const },
    { label: 'Mês — pedidos', value: paid.filter(o => o.createdAt >= startOfMonth).length, format: 'n' as const },
    { label: 'Mês — receita', value: paid.filter(o => o.createdAt >= startOfMonth).reduce((s, o) => s + o.totalCents, 0), format: 'c' as const },
    { label: 'Aguardando pag.', value: orders.filter(o => o.status === 'pending_payment').length, format: 'n' as const, alert: true },
  ];

  return (
    <div>
      <div className="border-b border-stone-200 pb-6 mb-8">
        <span className="eyebrow text-stone-400 mb-2 block">Visão geral</span>
        <h1 className="font-display text-3xl font-light text-stone-900">Dashboard</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-stone-200 mb-10">
        {kpis.map(k => (
          <div key={k.label} className={`flex flex-col gap-2 p-5 ${k.alert && k.value > 0 ? 'bg-amber-50' : 'bg-white'}`}>
            <p className={`text-2xs font-semibold tracking-widest uppercase ${k.alert && k.value > 0 ? 'text-amber-600' : 'text-stone-400'}`}>
              {k.label}
            </p>
            <p className={`font-display text-3xl font-light ${k.alert && k.value > 0 ? 'text-amber-700' : 'text-stone-900'}`}>
              {k.format === 'c' ? formatCurrency(k.value) : k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Pedidos recentes */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-xl font-light text-stone-900">Pedidos recentes</h2>
        <Link href="/painel/pedidos" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">Ver todos →</Link>
      </div>

      <div className="border border-stone-200 overflow-hidden">
        {/* Cabeçalho */}
        <div className="grid grid-cols-[150px_1fr_140px_120px_60px] gap-4 bg-stone-50 border-b border-stone-200 px-5 py-3">
          {['Pedido', 'Status', 'Data', 'Total', ''].map((h, i) => (
            <span key={i} className="text-2xs font-semibold tracking-widest uppercase text-stone-400">{h}</span>
          ))}
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><div className="spinner" /></div>
        ) : orders.length === 0 ? (
          <p className="py-12 text-center text-sm text-stone-400">Nenhum pedido ainda.</p>
        ) : (
          <ul>
            {orders.map((order, idx) => {
              const s = STATUS[order.status] ?? { label: order.status, cls: 'badge-default' };
              return (
                <li key={order.id} className={`grid grid-cols-[150px_1fr_140px_120px_60px] gap-4 items-center px-5 py-4 hover:bg-stone-50 transition-colors ${idx < orders.length - 1 ? 'border-b border-stone-100' : ''}`}>
                  <span className="font-mono text-xs text-stone-500">#{order.id.slice(-8).toUpperCase()}</span>
                  <span className={`badge ${s.cls} self-start`}>{s.label}</span>
                  <span className="text-xs text-stone-500">{formatDate(order.createdAt)}</span>
                  <span className="font-display text-lg text-stone-900">{formatCurrency(order.totalCents)}</span>
                  <Link href={`/painel/pedidos/${order.id}`} className="text-xs font-medium text-gold-600 hover:text-stone-900 transition-colors">
                    Ver →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
