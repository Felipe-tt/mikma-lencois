'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconMoney, IconBox, IconReceipt, IconTrophy, IconTruck, IconReports, IconAlert } from '@/components/ui/Icon';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { carrierNameVendor, type CarrierKey } from '@/lib/carriers';
import type { Order } from '@/types';

type Period = '7d' | '30d' | '90d';
type Stats = {
  revenue: number; orders: number; avgTicket: number;
  // Faturamento separado: frete é repassado à transportadora, então
  // "Faturamento" sozinho fazia a loja parecer vender mais do que vende.
  productsCents: number; shippingCents: number; discountCents: number;
  rows: Order[];
  topProducts: { name: string; qty: number; revenue: number }[];
  byCarrier: { name: string; count: number }[];
};

const fmt = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: '7d',  label: '7 dias',  days: 7 },
  { id: '30d', label: '30 dias', days: 30 },
  { id: '90d', label: '90 dias', days: 90 },
];

// Frete = total - produtos + desconto: bate sempre com o total, mesmo em
// pedido antigo sem shippingCents gravado.
function shippingOf(o: Order): { carrier?: string; cents: number } {
  const x = o as Order & { selectedShipping?: { carrier?: string } };
  const products = o.items.reduce((t, i) => t + i.unitPrice * i.quantity, 0);
  return { carrier: x.selectedShipping?.carrier, cents: Math.max(0, o.totalCents - products + (o.discountCents ?? 0)) };
}

const STATUS_PT: Record<string, string> = {
  paid: 'Pago', preparing: 'Separando', shipped: 'Enviado', delivered: 'Entregue',
};

// CSV no formato que o Excel brasileiro abre direto: ";" como separador,
// vírgula decimal e BOM pra acentuação.
function exportCsv(rows: Order[], periodLabel: string) {
  const money = (c: number) => (c / 100).toFixed(2).replace('.', ',');
  const cell = (v: string) => /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const header = ['Pedido', 'Data', 'Status', 'Pagamento', 'Itens', 'Produtos (R$)', 'Frete (R$)', 'Desconto (R$)', 'Total (R$)'];
  const lines = rows.map(o => {
    const products = o.items.reduce((t, i) => t + i.unitPrice * i.quantity, 0);
    return [
      o.id.slice(-8).toUpperCase(),
      new Date(String(o.createdAt)).toLocaleString('pt-BR'),
      STATUS_PT[o.status] ?? o.status,
      o.payment?.method === 'card' ? 'Cartão' : 'PIX',
      o.items.map(i => `${i.quantity}x ${i.productName}`).join(' + '),
      money(products),
      money(shippingOf(o).cents),
      money(o.discountCents ?? 0),
      money(o.totalCents),
    ].map(v => cell(String(v))).join(';');
  });
  const blob = new Blob(['\uFEFF' + [header.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vendas-mikma-${periodLabel.replace(' ', '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Trocar de período rápido (90d -> 7d) podia deixar o botão "7 dias"
  // mostrando os números de 90 dias, se a consulta maior voltasse por
  // último. Cada carga tem um número e só a mais recente atualiza a tela.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
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
        // pro nome que a pessoa reconhece. Pedido ainda não despachado usa
        // a escolha do cliente no checkout.
        const key = order.delivery?.carrier ?? shippingOf(order).carrier;
        const name = key ? carrierNameVendor(key as CarrierKey) : 'Não informado';
        carrierMap[name] = (carrierMap[name] ?? 0) + 1;
      }

      if (requestId !== requestRef.current) return;
      setStats({
        revenue,
        orders: orders.length,
        avgTicket: orders.length ? revenue / orders.length : 0,
        productsCents: orders.reduce((s, o) => s + o.items.reduce((t, i) => t + i.unitPrice * i.quantity, 0), 0),
        shippingCents: orders.reduce((s, o) => s + shippingOf(o).cents, 0),
        discountCents: orders.reduce((s, o) => s + (o.discountCents ?? 0), 0),
        rows: orders,
        topProducts: Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
        byCarrier: Object.entries(carrierMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      });
    } catch (err) {
      if (requestId !== requestRef.current) return;
      console.error('[relatorios] falha ao carregar:', err);
      setError('Não foi possível carregar os dados agora.');
      setStats(null);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const periodLabel = PERIODS.find(p => p.id === period)!.label;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-normal text-ink text-2xl">Relatórios</h1>
          <p className="text-[13px] text-faint mt-1">Como a loja se saiu nos últimos {periodLabel}.</p>
        </div>
        {stats && stats.orders > 0 && !loading && (
          <button onClick={() => exportCsv(stats.rows, periodLabel)} className="btn-outline !rounded-full h-10 text-[12px] px-4">
            Baixar planilha (CSV)
          </button>
        )}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <div key={i} className={`h-28 skeleton rounded-2xl ${i === 1 ? 'col-span-2 sm:col-span-1' : ''}`} />)}
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

          {/* No celular: faturamento na largura toda, pedidos e ticket lado a
              lado (antes eram três cartões de 150px empilhados). */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { Icon: IconMoney,   label: 'Faturamento', value: fmt(stats.revenue),   desc: 'soma dos pedidos pagos' },
              { Icon: IconBox,     label: 'Pedidos',     value: String(stats.orders), desc: 'pedidos no período' },
              { Icon: IconReceipt, label: 'Ticket médio', value: fmt(stats.avgTicket), desc: 'valor médio por pedido' },
            ].map((k, i) => (
              <div key={k.label} className={`panel-stat min-w-0 ${i === 0 ? 'col-span-2 sm:col-span-1' : ''}`}>
                <span className="panel-stat-icon mb-3"><k.Icon size={17} /></span>
                <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-faint mb-1">{k.label}</p>
                <p className="font-display text-2xl text-ink leading-none">{k.value}</p>
                <p className="text-[10.5px] text-faint mt-1">{k.desc}</p>
              </div>
            ))}
          </div>

          <section className="panel-card px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
            {[
              { label: 'Produtos', value: stats.productsCents, hint: 'o que a loja vendeu' },
              { label: 'Frete cobrado', value: stats.shippingCents, hint: 'repassado às transportadoras' },
              { label: 'Descontos', value: -stats.discountCents, hint: 'cupons usados' },
            ].map(r => (
              <div key={r.label} className="flex sm:flex-col items-baseline sm:items-start justify-between gap-1">
                <span className="text-[11px] font-semibold text-faint">{r.label}</span>
                <span className="text-[15px] font-semibold text-ink tabular-nums">{r.value < 0 ? `− ${fmt(-r.value)}` : fmt(Math.abs(r.value))}</span>
                <span className="hidden sm:block text-[10.5px] text-faint">{r.hint}</span>
              </div>
            ))}
          </section>

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
