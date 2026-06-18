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
  pending_payment: 'Aguardando pagamento', paid: 'Pago ✓', preparing: 'Separando',
  shipped: 'A caminho', delivered: 'Entregue ✓', cancelled: 'Cancelado',
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
    { label: 'Pedidos hoje', value: paid.filter(o => o.createdAt >= todayStr).length, fmt: 'n' as const, desc: 'pedidos pagos', icon: '📦' },
    { label: 'Dinheiro hoje', value: paid.filter(o => o.createdAt >= todayStr).reduce((s, o) => s + o.totalCents, 0), fmt: 'c' as const, desc: 'receita do dia', icon: '💰' },
    { label: 'Pedidos no mês', value: paid.filter(o => o.createdAt >= monthStr).length, fmt: 'n' as const, desc: 'pedidos pagos', icon: '📅' },
    { label: 'Dinheiro no mês', value: paid.filter(o => o.createdAt >= monthStr).reduce((s, o) => s + o.totalCents, 0), fmt: 'c' as const, desc: 'receita do mês', icon: '📈' },
  ];

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display font-normal text-[#1E1208] text-2xl">Olá! 👋</h1>
        <p className="text-[13px] text-[#B09C8C] mt-1">Aqui está um resumo do que está acontecendo na sua loja.</p>
      </div>

      {/* Alertas */}
      {(waiting > 0 || needAction > 0) && (
        <div className="flex flex-col gap-2 mb-6">
          {needAction > 0 && (
            <Link href="/painel/pedidos" className="flex items-center justify-between bg-[#C4714A] text-white px-5 py-3.5 hover:bg-[#A05432] transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-xl">📦</span>
                <div>
                  <p className="text-[13px] font-bold">{needAction} {needAction === 1 ? 'pedido precisa' : 'pedidos precisam'} ser separado{needAction !== 1 ? 's' : ''}</p>
                  <p className="text-[11px] opacity-80">Clique aqui para ver e começar a separar</p>
                </div>
              </div>
              <span className="text-white/60 text-lg">→</span>
            </Link>
          )}
          {waiting > 0 && (
            <Link href="/painel/pedidos" className="flex items-center justify-between bg-amber-50 border border-amber-200 text-amber-800 px-5 py-3.5 hover:bg-amber-100 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-xl">⏳</span>
                <div>
                  <p className="text-[13px] font-bold">{waiting} {waiting === 1 ? 'pedido aguardando' : 'pedidos aguardando'} pagamento</p>
                  <p className="text-[11px] opacity-70">O cliente ainda não pagou — pode ser normal levar alguns minutos</p>
                </div>
              </div>
              <span className="opacity-40 text-lg">→</span>
            </Link>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {kpis.map(k => (
          <div key={k.label} className="bg-[#FAF8F5] border border-[#E6DFD5] px-4 py-4 flex flex-col gap-2">
            <span className="text-2xl">{k.icon}</span>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#B09C8C] mb-0.5">{k.label}</p>
              <p className="font-display text-xl text-[#1E1208] leading-none">
                {k.fmt === 'c' ? formatCurrency(k.value) : k.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Pedidos recentes */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-normal text-[#1E1208] text-lg">Últimos pedidos</h2>
        <Link href="/painel/pedidos" className="text-[12px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors">
          Ver todos →
        </Link>
      </div>

      <div className="bg-[#FAF8F5] border border-[#E6DFD5] overflow-hidden">
        {orders.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">🛍</p>
            <p className="text-sm text-[#B09C8C]">Nenhum pedido ainda.<br />Quando alguém comprar, vai aparecer aqui.</p>
          </div>
        ) : orders.map((o, idx) => (
          <div key={o.id} className={`flex items-center justify-between px-5 py-3.5 hover:bg-[#F0EAE1] transition-colors ${idx < orders.length - 1 ? 'border-b border-[#E6DFD5]' : ''}`}>
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[11px] font-mono text-[#B09C8C] shrink-0">#{o.id.slice(-6).toUpperCase()}</span>
              <span className={BADGE[o.status] ?? 'badge'}>{LABEL[o.status] ?? o.status}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[11px] text-[#B09C8C] hidden sm:block">{formatTsDateTime(o.createdAt)}</span>
              <span className="font-display text-sm text-[#1E1208]">{formatCurrency(o.totalCents)}</span>
              <Link href={`/painel/pedidos/${o.id}`} className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors shrink-0">Ver →</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
