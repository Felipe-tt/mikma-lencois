'use client';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, orderBy, limit, where, onSnapshot } from 'firebase/firestore';
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

function startOfMonthISO() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString();
}
function startOfTodayISO() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString();
}

export default function PainelDashboard() {
  // Duas consultas de propósito, com papéis diferentes:
  //
  // `recent` alimenta só a lista "Últimos pedidos" — 10 basta.
  // `monthly` alimenta os números e os avisos do topo.
  //
  // Antes existia só a primeira, e os KPIs eram calculados em cima
  // dela: "Pedidos no mês" e "Dinheiro no mês" só enxergavam os 10
  // pedidos mais recentes, então a partir do 11º pedido do mês os
  // números ficavam errados pra menos, sem nenhum aviso. O mesmo valia
  // pros avisos de "X pedidos precisam ser separados", que travavam em
  // 10. createdAt é string ISO no Firestore, então o corte do mês
  // também é string (ISO-8601 ordena igual lexicográfica e
  // cronologicamente).
  const [recent, setRecent] = useState<Order[] | null>(null);
  const [monthly, setMonthly] = useState<Order[] | null>(null);

  useEffect(() => {
    const unsubRecent = onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(10)),
      snap => setRecent(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))),
      err => { console.error('[painel] pedidos recentes:', err); setRecent([]); }
    );
    const unsubMonthly = onSnapshot(
      query(collection(db, 'orders'), where('createdAt', '>=', startOfMonthISO()), orderBy('createdAt', 'desc')),
      snap => setMonthly(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))),
      err => { console.error('[painel] pedidos do mês:', err); setMonthly([]); }
    );
    return () => { unsubRecent(); unsubMonthly(); };
  }, []);

  if (recent === null || monthly === null) return <DashboardSkeleton />;

  const counted = monthly.filter(o => o.status !== 'pending_payment' && o.status !== 'cancelled');
  const todayStr = startOfTodayISO();
  const today = counted.filter(o => o.createdAt >= todayStr);

  const waiting = monthly.filter(o => o.status === 'pending_payment').length;
  const needAction = monthly.filter(o => o.status === 'paid').length;

  const kpis = [
    { label: 'Pedidos hoje',    value: today.length,                                      fmt: 'n' as const, desc: 'pedidos pagos',  Icon: IconBox },
    { label: 'Dinheiro hoje',   value: today.reduce((s, o) => s + o.totalCents, 0),       fmt: 'c' as const, desc: 'receita do dia',  Icon: IconMoney },
    { label: 'Pedidos no mês',  value: counted.length,                                    fmt: 'n' as const, desc: 'pedidos pagos',  Icon: IconCalendar },
    { label: 'Dinheiro no mês', value: counted.reduce((s, o) => s + o.totalCents, 0),     fmt: 'c' as const, desc: 'receita do mês', Icon: IconTrend },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <span className="panel-live-dot" aria-hidden="true" />
        <div>
          <h1 className="font-display font-normal text-ink text-2xl">Olá!</h1>
          <p className="text-[13px] text-faint mt-0.5">Um resumo do que está acontecendo na loja, em tempo real.</p>
        </div>
      </div>

      {(waiting > 0 || needAction > 0) && (
        <div className="flex flex-col gap-2.5 mb-7">
          {needAction > 0 && (
            <Link href="/painel/pedidos" className="group flex items-center justify-between gap-3 bg-clay-l text-paper px-5 py-4 rounded-2xl hover:bg-clay-d transition-colors duration-200 shadow-card hover:shadow-card-hover">
              <span className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-paper/15 shrink-0">
                  <IconBox size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold">
                    {needAction} {needAction === 1 ? 'pedido para separar' : 'pedidos para separar'}
                  </span>
                  <span className="block text-[11px] opacity-80">Já foram pagos e estão esperando</span>
                </span>
              </span>
              <IconArrowRight size={16} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}
          {waiting > 0 && (
            <Link href="/painel/pedidos" className="group flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 px-5 py-4 rounded-2xl hover:bg-amber-100 dark:hover:bg-amber-500/15 transition-colors duration-200">
              <span className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500/15 shrink-0">
                  <IconHourglass size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold">
                    {waiting} {waiting === 1 ? 'pedido aguardando pagamento' : 'pedidos aguardando pagamento'}
                  </span>
                  <span className="block text-[11px] opacity-70">Normal levar alguns minutos até o PIX cair</span>
                </span>
              </span>
              <IconArrowRight size={16} className="shrink-0 opacity-50 group-hover:opacity-90 transition-opacity" />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {kpis.map(k => (
          <div key={k.label} className="panel-stat">
            <span className="panel-stat-icon mb-3"><k.Icon size={17} /></span>
            <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-faint mb-1">{k.label}</p>
            <p className="font-display text-2xl text-ink leading-none">
              {k.fmt === 'c' ? formatCurrency(k.value) : k.value}
            </p>
            <p className="text-[10.5px] text-faint mt-1">{k.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-normal text-ink text-lg">Últimos pedidos</h2>
        <Link href="/painel/pedidos" className="flex items-center gap-1 text-[12px] font-semibold text-clay-l hover:text-clay-d transition-colors">
          Ver todos
          <IconArrowRight size={13} />
        </Link>
      </div>

      <div className="panel-card divide-y divide-mist/70 overflow-hidden">
        {recent.length === 0 ? (
          <div className="panel-empty">
            <span className="panel-empty-icon"><IconProducts size={20} /></span>
            <p className="text-[13px] font-medium text-ink">Nenhum pedido ainda</p>
            <p className="text-[12px] text-faint mt-1">Quando alguém comprar, o pedido aparece aqui na hora.</p>
          </div>
        ) : recent.map(o => (
          <Link
            key={o.id}
            href={`/painel/pedidos/${o.id}`}
            className="panel-row flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="text-[11px] font-mono text-faint shrink-0">#{o.id.slice(-6).toUpperCase()}</span>
              <span className={BADGE[o.status] ?? 'badge'}>{LABEL[o.status] ?? o.status}</span>
            </span>
            <span className="flex items-center gap-4 shrink-0">
              <span className="text-[11px] text-faint hidden sm:block">{formatTsDateTime(o.createdAt)}</span>
              <span className="font-display text-sm text-ink">{formatCurrency(o.totalCents)}</span>
              <IconArrowRight size={13} className="text-faint" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
