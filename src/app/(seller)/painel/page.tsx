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
const STATUS_COLOR: Record<string, string> = {
  pending_payment: '#B45309', paid: '#166534', preparing: '#1E40AF',
  shipped: '#6B21A8', delivered: '#166534', cancelled: '#991B1B',
};
const STATUS_BG: Record<string, string> = {
  pending_payment: '#FEF3C7', paid: '#DCFCE7', preparing: '#DBEAFE',
  shipped: '#F3E8FF', delivered: '#DCFCE7', cancelled: '#FEE2E2',
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

  return (
    <div>
      {/* Page title */}
      <div style={{ marginBottom: 32, borderBottom: '1px solid var(--cream-d)', paddingBottom: 20 }}>
        <p className="section-label" style={{ marginBottom: 4 }}>Visão geral</p>
        <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 30, fontWeight: 300, color: 'var(--ink)' }}>Dashboard</h1>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: 'var(--cream-d)', marginBottom: 40 }}>
        {[
          { label: 'Pedidos hoje', value: kpis.todayOrders, format: 'n' },
          { label: 'Receita hoje', value: kpis.todayRevenue, format: 'c' },
          { label: 'Pedidos no mês', value: kpis.monthOrders, format: 'n' },
          { label: 'Receita no mês', value: kpis.monthRevenue, format: 'c' },
          { label: 'Aguardando pag.', value: kpis.pendingOrders, format: 'n', alert: kpis.pendingOrders > 0 },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: kpi.alert ? '#FFFBEB' : 'var(--white)', padding: '24px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: kpi.alert ? '#B45309' : 'var(--ink-l)', marginBottom: 8 }}>{kpi.label}</p>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 26, color: kpi.alert ? '#B45309' : 'var(--ink)', fontWeight: 400 }}>
              {kpi.format === 'c' ? formatCurrency(kpi.value) : kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: 'var(--ink)', fontWeight: 400 }}>Pedidos recentes</p>
          <Link href="/painel/pedidos" style={{ fontSize: 12, color: 'var(--ink-l)', textDecoration: 'none' }} className="hover:text-ink transition-colors">Ver todos →</Link>
        </div>

        <div style={{ border: '1px solid var(--cream-d)' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 100px 100px 80px 60px', gap: 0, padding: '10px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--cream-d)' }}>
            {['Pedido', 'Status', 'Data', 'Total', '', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-l)' }}>{h}</span>
            ))}
          </div>
          {orders.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-l)' }}>Nenhum pedido ainda.</div>
          ) : orders.map((order, idx) => (
            <div key={order.id} style={{
              display: 'grid', gridTemplateColumns: '120px 1fr 100px 100px 80px 60px',
              padding: '14px 16px', borderBottom: idx < orders.length - 1 ? '1px solid var(--cream-d)' : 'none',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--ink-m)' }}>#{order.id.slice(-8).toUpperCase()}</span>
              <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 500, padding: '3px 8px',
                background: STATUS_BG[order.status] ?? '#F3F4F6', color: STATUS_COLOR[order.status] ?? '#374151' }}>
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-l)' }}>{formatDate(order.createdAt)}</span>
              <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 15, color: 'var(--ink)' }}>{formatCurrency(order.totalCents)}</span>
              <span />
              <Link href={`/painel/pedidos/${order.id}`} style={{ fontSize: 12, color: 'var(--warm-d)', textDecoration: 'none', fontWeight: 500 }}
                className="hover:text-ink transition-colors">Ver →</Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
