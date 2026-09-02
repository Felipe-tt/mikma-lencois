'use client';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import type { Order } from '@/types';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import Link from 'next/link';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { IconBox, IconMoney, IconCalendar, IconTrend, IconHourglass, IconProducts, IconArrowRight } from '@/components/ui/Icon';

const BADGE: Record<string, string> = {
  pending_payment: 'badge-pending', paid: 'badge-paid', preparing: 'badge-preparing',
  shipped: 'badge-shipped', delivered: 'badge-delivered', cancelled: 'badge-cancelled',
};
const LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pagamento', paid: 'Pago', preparing: 'Separando',
  shipped: 'A caminho', delivered: 'Entregue', cancelled: 'Cancelado',
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
  const needAction = orders.filter(o => o.status === 'paid').length;

  const kpis = [
    { label: 'Pedidos hoje',    value: paid.filter(o => o.createdAt >= todayStr).length, fmt: 'n' as const, desc: 'pedidos pagos',  Icon: IconBox },
    { label: 'Dinheiro hoje',   value: paid.filter(o => o.createdAt >= todayStr).reduce((s, o) => s + o.totalCents, 0), fmt: 'c' as const, desc: 'receita do dia',  Icon: IconMoney },
    { label: 'Pedidos no mês',  value: paid.filter(o => o.createdAt >= monthStr).length, fmt: 'n' as const, desc: 'pedidos pagos',  Icon: IconCalendar },
    { label: 'Dinheiro no mês', value: paid.filter(o => o.createdAt >= monthStr).reduce((s, o) => s + o.totalCents, 0), fmt: 'c' as const, desc: 'receita do mês', Icon: IconTrend },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <span className="panel-live-dot" />
        <div>
          <h1 className="font-display font-normal text-ink text-2xl">Olá!</h1>
          <p className="text-[13px] text-faint mt-0.5">Aqui está um resumo do que está acontecendo na sua loja, em tempo real.</p>
        </div>
      </div>

      {/* Alertas */}
      {(waiting > 0 || needAction > 0) && (
        <div className="flex flex-col gap-2.5 mb-7">
          {needAction > 0 && (
            <Link href="/painel/pedidos" className="group flex items-center justify-between bg-clay-l text-paper px-5 py-4 rounded-2xl hover:bg-clay-d transition-all duration-200 shadow-card hover:shadow-card-hover">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-paper/15 shrink-0">
                  <IconBox size={17} />
                </span>
                <div>
                  <p className="text-[13px] font-bold">{needAction} {needAction === 1 ? 'pedido precisa' : 'pedidos precisam'} ser separado{needAction !== 1 ? 's' : ''}</p>
                  <p className="text-[11px] opacity-80">Toque para ver e começar a separar</p>
                </div>
              </div>
              <IconArrowRight size={16} className="shrink-0 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </Link>
          )}
          {waiting > 0 && (
            <Link href="/painel/pedidos" className="group flex items-center justify-between bg-amber-50 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 px-5 py-4 rounded-2xl hover:bg-amber-100 dark:hover:bg-amber-500/15 transition-all duration-200">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500/15 shrink-0">
                  <IconHourglass size={17} />
                </span>
                <div>
                  <p className="text-[13px] font-bold">{waiting} {waiting === 1 ? 'pedido aguardando' : 'pedidos aguardando'} pagamento</p>
                  <p className="text-[11px] opacity-70">O cliente ainda não pagou, pode ser normal levar alguns minutos</p>
                </div>
              </div>
              <IconArrowRight size={16} className="shrink-0 opacity-50 group-hover:opacity-90 group-hover:translate-x-0.5 transition-all" />
            </Link>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {kpis.map(k => (
          <div key={k.label} className="panel-stat">
            <span className="panel-stat-icon mb-3">
              <k.Icon size={17} />
            </span>
            <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-faint mb-1">{k.label}</p>
            <p className="font-display text-2xl text-ink leading-none">
              {k.fmt === 'c' ? formatCurrency(k.value) : k.value}
            </p>
            <p className="text-[10.5px] text-faint mt-1">{k.desc}</p>
          </div>
        ))}
      </div>

      {/* Pedidos recentes */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-normal text-ink text-lg">Últimos pedidos</h2>
        <Link href="/painel/pedidos" className="flex items-center gap-1 text-[12px] font-semibold text-clay-l hover:text-clay-d transition-colors">
          Ver todos
          <IconArrowRight size={13} />
        </Link>
      </div>

      <div className="panel-card divide-y divide-mist/70">
        {orders.length === 0 ? (
          <div className="py-16 text-center">
            <IconProducts size={40} className="text-mist mx-auto mb-3" />
            <p className="text-sm text-faint">Nenhum pedido ainda.<br />Quando alguém comprar, vai aparecer aqui.</p>
          </div>
        ) : orders.map((o, idx) => (
          <div key={o.id} className={`panel-row flex items-center justify-between ${idx === 0 ? 'rounded-t-2xl' : ''} ${idx === orders.length - 1 ? 'rounded-b-2xl' : ''}`}>
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[11px] font-mono text-faint shrink-0">#{o.id.slice(-6).toUpperCase()}</span>
              <span className={BADGE[o.status] ?? 'badge'}>{LABEL[o.status] ?? o.status}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[11px] text-faint hidden sm:block">{formatTsDateTime(o.createdAt)}</span>
              <span className="font-display text-sm text-ink">{formatCurrency(o.totalCents)}</span>
              <Link href={`/painel/pedidos/${o.id}`} className="text-[11px] font-semibold text-clay-l hover:text-clay-d transition-colors shrink-0">Ver</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
