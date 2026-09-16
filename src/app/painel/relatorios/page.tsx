'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconMoney, IconBox, IconReceipt, IconTrophy, IconTruck, IconReports, IconAlert } from '@/components/ui/Icon';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { carrierName, type CarrierKey } from '@/lib/carriers';
import type { Order } from '@/types';

type Period = '7d' | '30d' | '90d';
type Stats = {
  revenue: number; orders: number; avgTicket: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  byCarrier: { name: string; count: number }[];
};

const fmt = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: '7d',  label: '7 dias',  days: 7 },
  { id: '30d', label: '30 dias', days: 30 },
  { id: '90d', label: '90 dias', days: 90 },
];

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const days = PERIODS.find(p => p.id === period)!.days;
      const since = new Date();
      since.setDate(since.getDate() - days);

      // createdAt é gravado como string ISO (new Date().toISOString() em
      // create-pix/create-checkout), então o corte do período também tem
      // que ser string ISO. Antes isso comparava contra Timestamp: no
      // Firestore tipos diferentes nunca se comparam entre si, e string
      // ordena sempre depois de timestamp, então o filtro deixava passar
      // TODOS os pedidos — o seletor de 7/30/90 dias não fazia nada e a
      // tela sempre mostrava o período inteiro. Como ISO-8601 ordena
      // igual lexicograficamente e cronologicamente, comparar string com
      // string funciona direto.
      const snap = await getDocs(query(
        collection(db, 'orders'),
        where('status', 'in', ['paid', 'preparing', 'shipped', 'delivered']),
        where('createdAt', '>=', since.toISOString()),
        orderBy('createdAt', 'desc'),
      ));

      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      const revenue = orders.reduce((s, o) => s + o.totalCents, 0);

      const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      for (const order of orders) {
        for (const item of order.items) {
          if (!productMap[item.productId]) productMap[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
          productMap[item.productId].qty += item.quantity;
          productMap[item.productId].revenue += item.unitPrice * item.quantity;
        }
      }

      const carrierMap: Record<string, number> = {};
      for (const order of orders) {
        // carrierName traduz a chave interna (uber_direct, correios_pac)
        // pro nome que a pessoa reconhece.
        const key = order.delivery?.carrier;
        const name = key ? carrierName(key as CarrierKey) : 'Não informado';
        carrierMap[name] = (carrierMap[name] ?? 0) + 1;
      }

      setStats({
        revenue,
        orders: orders.length,
        avgTicket: orders.length ? revenue / orders.length : 0,
        topProducts: Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
        byCarrier: Object.entries(carrierMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      });
    } catch (err) {
      console.error('[relatorios] falha ao carregar:', err);
      setError('Não foi possível carregar os dados agora.');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const periodLabel = PERIODS.find(p => p.id === period)!.label;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Relatórios</h1>
        <p className="text-[13px] text-faint mt-1">Como a loja se saiu nos últimos {periodLabel}.</p>
      </div>

      <div
        role="group"
        aria-label="Período do relatório"
        className="inline-flex items-center gap-1 p-1 mb-6 bg-warm/70 border border-mist/70 rounded-xl"
      >
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            aria-pressed={period === p.id}
            className={`px-4 py-2 text-[12.5px] font-semibold rounded-lg transition-colors duration-150 ${
              period === p.id ? 'bg-paper text-ink shadow-card' : 'text-mid hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <div key={i} className="h-28 skeleton rounded-2xl" />)}
          </div>
          <div className="h-48 skeleton rounded-2xl" />
        </div>
      ) : error ? (
        <div className="panel-card panel-empty">
          <span className="panel-empty-icon"><IconAlert size={20} /></span>
          <p className="text-[13px] text-mid">{error}</p>
          <button onClick={load} className="mt-4 btn-outline text-[12px] px-4 py-2">Tentar de novo</button>
        </div>
      ) : !stats ? null : stats.orders === 0 ? (
        <div className="panel-card panel-empty">
          <span className="panel-empty-icon"><IconReports size={20} /></span>
          <p className="text-[13px] font-medium text-ink">Nenhuma venda nos últimos {periodLabel}</p>
          <p className="text-[12px] text-faint mt-1">Escolha um período maior para ver mais histórico.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { Icon: IconMoney,   label: 'Faturamento', value: fmt(stats.revenue),   desc: 'soma dos pedidos pagos' },
              { Icon: IconBox,     label: 'Pedidos',     value: String(stats.orders), desc: 'pedidos no período' },
              { Icon: IconReceipt, label: 'Ticket médio', value: fmt(stats.avgTicket), desc: 'valor médio por pedido' },
            ].map(k => (
              <div key={k.label} className="panel-stat">
                <span className="panel-stat-icon mb-3"><k.Icon size={17} /></span>
                <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-faint mb-1">{k.label}</p>
                <p className="font-display text-2xl text-ink leading-none">{k.value}</p>
                <p className="text-[10.5px] text-faint mt-1">{k.desc}</p>
              </div>
            ))}
          </div>

          <section className="panel-card overflow-hidden">
            <header className="panel-card-header">
              <IconTrophy size={14} className="text-clay-l shrink-0" />
              <div>
                <p className="text-[13px] font-bold text-ink leading-tight">Produtos mais vendidos</p>
                <p className="text-[11px] text-faint">Por receita gerada no período</p>
              </div>
            </header>
            <div className="divide-y divide-mist/70">
              {stats.topProducts.map((p, i) => {
                const maxRevenue = stats.topProducts[0].revenue;
                const pct = maxRevenue > 0 ? Math.round((p.revenue / maxRevenue) * 100) : 0;
                return (
                  <div key={i} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[12px] font-bold text-faint/70 w-4 shrink-0 tabular-nums">{i + 1}</span>
                        <span className="text-[13px] text-ink font-medium truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] text-faint tabular-nums">{p.qty} un.</span>
                        <span className="text-[13px] font-semibold text-ink tabular-nums">{fmt(p.revenue)}</span>
                      </div>
                    </div>
                    <div
                      className="h-1.5 bg-mist/70 rounded-full overflow-hidden"
                      role="img"
                      aria-label={`${pct}% da receita do produto mais vendido`}
                    >
                      <div
                        className="h-full bg-clay-l rounded-full transition-[width] duration-500 ease-out w-[var(--w)]"
                        style={{ '--w': `${pct}%` } as React.CSSProperties}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {stats.byCarrier.length > 0 && (
            <section className="panel-card overflow-hidden">
              <header className="panel-card-header">
                <IconTruck size={14} className="text-clay-l shrink-0" />
                <div>
                  <p className="text-[13px] font-bold text-ink leading-tight">Formas de entrega</p>
                  <p className="text-[11px] text-faint">Quantos pedidos por transportadora</p>
                </div>
              </header>
              <div className="divide-y divide-mist/70">
                {stats.byCarrier.map((c, i) => (
                  <div key={i} className="flex justify-between items-center px-5 py-3.5">
                    <span className="text-[13px] text-ink">{c.name}</span>
                    <span className="text-[13px] font-semibold text-mid tabular-nums">
                      {c.count} pedido{c.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
