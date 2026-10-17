'use client';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, orderBy, limit, where, onSnapshot } from 'firebase/firestore';
import type { Order } from '@/types';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import Link from 'next/link';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { IconBox, IconMoney, IconCalendar, IconTrend, IconHourglass, IconProducts, IconArrowRight, IconTruck } from '@/components/ui/Icon';
import { PanelErrorState } from '@/components/painel/PanelErrorState';
import { useAuth } from '@/lib/auth/AuthContext';

const BADGE: Record<string, string> = {
  pending_payment: 'badge-pending', payment_expired: 'badge-pending', paid: 'badge-paid', preparing: 'badge-preparing',
  shipped: 'badge-shipped', delivered: 'badge-delivered', cancelled: 'badge-cancelled',
};
const LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pagamento', payment_expired: 'PIX expirado', paid: 'Pago', preparing: 'Separando',
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
  const { user } = useAuth();
  const firstName = user?.displayName?.trim().split(/\s+/)[0] ?? '';
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
  // Pedidos que pedem ação, sem corte de data: um pedido pago no dia 31
  // sumia do aviso "para separar" no dia 1º.
  const [pending, setPending] = useState<Order[] | null>(null);
  // Pedidos pagos e cancelados (ou pagos depois do cancelamento) com o
  // dinheiro ainda por devolver.
  const [refunds, setRefunds] = useState<Order[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const unsubRecent = onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(10)),
      snap => setRecent(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))),
      err => { console.error('[painel] pedidos recentes:', err); setRecent([]); setLoadError(true); }
    );
    const unsubMonthly = onSnapshot(
      query(collection(db, 'orders'), where('createdAt', '>=', startOfMonthISO()), orderBy('createdAt', 'desc')),
      snap => setMonthly(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))),
      err => { console.error('[painel] pedidos do mês:', err); setMonthly([]); setLoadError(true); }
    );
    const unsubPending = onSnapshot(
      query(collection(db, 'orders'), where('status', 'in', ['paid', 'preparing', 'pending_payment'])),
      snap => setPending(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))),
      err => { console.error('[painel] pedidos pendentes:', err); setPending([]); setLoadError(true); }
    );
    const unsubRefunds = onSnapshot(
      query(collection(db, 'orders'), where('payment.refundStatus', '==', 'pending')),
      snap => setRefunds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))),
      err => { console.error('[painel] estornos pendentes:', err); setRefunds([]); }
    );
    return () => { unsubRecent(); unsubMonthly(); unsubPending(); unsubRefunds(); };
  }, []);

  // Sem isso, uma falha de rede/permissão mostrava a tela zerada como se
  // não houvesse nenhuma venda.
  if (loadError) return <PanelErrorState message="Não foi possível carregar o resumo da loja." onRetry={() => window.location.reload()} />;
  if (recent === null || monthly === null || pending === null || refunds === null) return <DashboardSkeleton />;

  // Só pedidos efetivamente pagos (antes payment_expired entrava como receita).
  const PAID = new Set(['paid', 'preparing', 'shipped', 'delivered']);
  const counted = monthly.filter(o => PAID.has(o.status));
  // "Hoje" é pelo dia do PAGAMENTO: um PIX gerado ontem e pago hoje é
  // venda de hoje. Pedido sem paidAt (antigos) cai no createdAt.
  const todayStart = Date.parse(startOfTodayISO());
  const paidMs = (o: Order) => {
    const p = o.payment?.paidAt as unknown;
    if (p && typeof p === 'object' && 'seconds' in p) return (p as { seconds: number }).seconds * 1000;
    return Date.parse(String(p ?? o.createdAt)) || 0;
  };
  const today = counted.filter(o => paidMs(o) >= todayStart);

  const waiting = pending.filter(o => o.status === 'pending_payment').length;
  const needAction = pending.filter(o => o.status === 'paid').length;
  const readyToShip = pending.filter(o => o.status === 'preparing').length;

  const kpis = [
    { label: 'Pedidos hoje',    value: today.length,                                      fmt: 'n' as const, desc: 'pedidos pagos',  Icon: IconBox },
    { label: 'Dinheiro hoje',   value: today.reduce((s, o) => s + o.totalCents, 0),       fmt: 'c' as const, desc: 'receita do dia',  Icon: IconMoney },
    { label: 'Pedidos no mês',  value: counted.length,                                    fmt: 'n' as const, desc: 'pedidos pagos',  Icon: IconCalendar },
    { label: 'Dinheiro no mês', value: counted.reduce((s, o) => s + o.totalCents, 0),     fmt: 'c' as const, desc: 'receita do mês', Icon: IconTrend },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display font-normal text-ink text-2xl">{firstName ? `Olá, ${firstName}!` : 'Olá!'}</h1>
        <p className="flex items-center gap-2 text-[13px] text-faint mt-1">
          <span className="panel-live-dot" aria-hidden="true" />
          Um resumo do que está acontecendo na loja, em tempo real.
        </p>
      </div>

      {(waiting > 0 || needAction > 0 || readyToShip > 0 || refunds.length > 0) && (
        <div className="flex flex-col gap-2.5 mb-7">
          {refunds.length > 0 && (
            <Link href={refunds.length === 1 ? `/painel/pedidos/${refunds[0].id}` : '/painel/pedidos?status=cancelled'} className="group flex items-center justify-between gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-300 px-5 py-4 rounded-2xl hover:bg-red-100 dark:hover:bg-red-500/15 transition-colors duration-200">
              <span className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-red-500/15 shrink-0">
                  <IconMoney size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold">
                    {refunds.length} {refunds.length === 1 ? 'estorno pendente' : 'estornos pendentes'}
                  </span>
                  <span className="block text-[11px] opacity-75">
                    {formatCurrency(refunds.reduce((s, o) => s + o.totalCents, 0))} a devolver para clientes de pedidos cancelados
                  </span>
                </span>
              </span>
              <IconArrowRight size={16} className="shrink-0 opacity-50 group-hover:opacity-90 transition-opacity" />
            </Link>
          )}
          {needAction > 0 && (
            <Link href="/painel/pedidos?status=paid" className="group flex items-center justify-between gap-3 bg-clay-l text-paper px-5 py-4 rounded-2xl hover:bg-clay-d transition-colors duration-200 shadow-card hover:shadow-card-hover">
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
          {readyToShip > 0 && (
            <Link href="/painel/pedidos?status=preparing" className="group flex items-center justify-between gap-3 bg-paper border border-mist text-ink px-5 py-4 rounded-2xl hover:bg-warm transition-colors duration-200">
              <span className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-warm shrink-0">
                  <IconTruck size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold">
                    {readyToShip} {readyToShip === 1 ? 'pedido separado' : 'pedidos separados'}, pronto{readyToShip === 1 ? '' : 's'} para despachar
                  </span>
                  <span className="block text-[11px] text-faint">Poste nos Correios ou chame o motoboy e informe no pedido</span>
                </span>
              </span>
              <IconArrowRight size={16} className="shrink-0 text-faint opacity-60 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}
          {waiting > 0 && (
            <Link href="/painel/pedidos?status=pending_payment" className="group flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 px-5 py-4 rounded-2xl hover:bg-amber-100 dark:hover:bg-amber-500/15 transition-colors duration-200">
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
            {/* No celular o ID fica em cima do status: lado a lado, "Aguardando
                pagamento" quebrava em duas linhas dentro do selo. */}
            <span className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3 min-w-0">
              <span className="text-[11px] font-mono text-faint shrink-0">#{o.id.slice(-8).toUpperCase()}</span>
              <span className={`${BADGE[o.status] ?? 'badge'} whitespace-nowrap`}>{LABEL[o.status] ?? o.status}</span>
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
