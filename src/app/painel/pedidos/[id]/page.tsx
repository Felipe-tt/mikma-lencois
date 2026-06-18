'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Order, OrderTimelineEvent } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

const STATUS_LABELS: Record<Order['status'], string> = {
  pending_payment: 'Aguardando Pagamento',
  paid: 'Pago',
  preparing: 'Em Preparo',
  shipped: 'Despachado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};
const STATUS_BADGE: Record<Order['status'], string> = {
  pending_payment: 'badge-pending',
  paid: 'badge-paid',
  preparing: 'badge-preparing',
  shipped: 'badge-shipped',
  delivered: 'badge-delivered',
  cancelled: 'badge-cancelled',
};
const STATUS_NEXT: Partial<Record<Order['status'], Order['status']>> = {
  paid: 'preparing',
  preparing: 'shipped',
  shipped: 'delivered',
};

const TIMELINE_LABEL: Record<string, string> = {
  created: 'Pedido criado',
  payment_initiated: 'PIX gerado',
  payment_confirmed: 'Pagamento confirmado',
  payment_expired: 'PIX expirado',
  payment_failed: 'Pagamento recusado',
  pending_payment: 'Aguardando pagamento',
  paid: 'Pago',
  preparing: 'Em preparo',
  shipped: 'Despachado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};
const TIMELINE_COLOR: Record<string, string> = {
  created: 'bg-faint/40',
  payment_initiated: 'bg-blue-400',
  payment_confirmed: 'bg-emerald-400',
  payment_expired: 'bg-orange-400',
  payment_failed: 'bg-red-400',
  pending_payment: 'bg-yellow-400',
  paid: 'bg-emerald-400',
  preparing: 'bg-blue-400',
  shipped: 'bg-purple-400',
  delivered: 'bg-emerald-500',
  cancelled: 'bg-red-400',
};

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(iso));
  } catch { return iso; }
}

export default function PainelPedidoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [trackingCode, setTrackingCode] = useState('');

  useEffect(() => {
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      router.push('/entrar'); return;
    }
    return onSnapshot(doc(db, 'orders', id), snap => {
      if (snap.exists()) setOrder({ id: snap.id, ...snap.data() } as Order);
      setLoading(false);
    });
  }, [id, user, router]);

  async function advanceStatus() {
    if (!order) return;
    const next = STATUS_NEXT[order.status];
    if (!next) return;
    setUpdating(true);
    try {
      const now = new Date().toISOString();
      const newEvent: OrderTimelineEvent = { status: next, at: now };
      const update: Record<string, unknown> = {
        status: next,
        updatedAt: serverTimestamp(),
        timeline: [...(order.timeline ?? []), newEvent],
      };
      if (next === 'shipped' && trackingCode) {
        update['delivery.trackingCode'] = trackingCode;
        update['delivery.dispatchedAt'] = serverTimestamp();
      }
      await updateDoc(doc(db, 'orders', id), update);
    } finally { setUpdating(false); }
  }

  async function dispatchDelivery() {
    if (!order) return;
    setUpdating(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, address: order.address, items: order.items }),
      });
      const data = await res.json();
      if (data.trackingCode) setTrackingCode(data.trackingCode);
    } finally { setUpdating(false); }
  }

  async function handleDelete() {
    if (!order || order.status !== 'cancelled') return;
    if (!confirm('Excluir permanentemente este pedido cancelado?')) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'orders', id));
      router.push('/painel/pedidos');
    } catch { setDeleting(false); }
  }

  if (loading) return (
    <div className="max-w-2xl flex flex-col gap-3">
      {[1,2,3,4].map(i => <div key={i} className="h-20 bg-[#F0EBE1] animate-pulse border border-[#E6DFD5]" />)}
    </div>
  );

  if (!order) return <p className="text-sm text-faint py-8 text-center">Pedido não encontrado.</p>;

  const nextStatus = STATUS_NEXT[order.status];
  const timeline = order.timeline ?? [];

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-faint active:text-ink transition-colors p-1 -ml-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <h1 className="font-display font-normal text-ink text-xl flex-1">
          #{order.id.slice(-8).toUpperCase()}
        </h1>
        <span className={STATUS_BADGE[order.status] ?? 'badge badge-pending'}>
          {STATUS_LABELS[order.status]}
        </span>
      </div>

      <div className="flex flex-col gap-3">

        {/* ── Timeline de pagamento ── */}
        {timeline.length > 0 && (
          <div className="bg-paper border border-mist p-4">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint mb-4">Timeline</p>
            <div className="relative">
              {/* linha vertical */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-mist" />
              <div className="flex flex-col gap-3.5">
                {timeline.map((ev, i) => (
                  <div key={i} className="flex items-start gap-3 relative">
                    <div className={`w-3 h-3 shrink-0 mt-1 ${TIMELINE_COLOR[ev.status] ?? 'bg-faint/40'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink leading-snug">
                        {TIMELINE_LABEL[ev.status] ?? ev.status}
                      </p>
                      {ev.note && <p className="text-xs text-mid mt-0.5">{ev.note}</p>}
                      <p className="text-xs text-faint mt-0.5 tabular-nums">{formatDateTime(ev.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Ações ── */}
        {(nextStatus || order.status === 'preparing') && (
          <div className="bg-paper border border-mist p-4 flex flex-col gap-3">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint">Gestão do pedido</p>
            {order.status === 'preparing' && (
              <div className="flex flex-col gap-2">
                <label className="label">Código de rastreio</label>
                <input
                  className="input font-mono"
                  placeholder="BR123456789BR"
                  value={trackingCode}
                  onChange={e => setTrackingCode(e.target.value)}
                />
                <button onClick={dispatchDelivery} disabled={updating}
                  className="w-full border border-mist text-sm font-medium text-mid py-3 active:bg-warm disabled:opacity-50 transition-colors">
                  {updating ? 'Processando…' : 'Acionar entrega automática'}
                </button>
              </div>
            )}
            {nextStatus && (
              <button onClick={advanceStatus} disabled={updating}
                className="w-full bg-ink text-paper text-sm font-semibold py-3.5 disabled:opacity-50 active:bg-ink/80 transition-colors">
                {updating ? 'Salvando…' : `Avançar para: ${STATUS_LABELS[nextStatus]}`}
              </button>
            )}
          </div>
        )}

        {/* ── Deletar se cancelado ── */}
        {order.status === 'cancelled' && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full border border-red-200 bg-red-50 text-red-700 text-sm font-semibold py-3 hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'Excluindo…' : 'Excluir pedido cancelado'}
          </button>
        )}

        {/* ── Itens ── */}
        <div className="bg-[#FAF8F5] border border-[#E6DFD5]">
          <div className="px-5 py-3 border-b border-[#E6DFD5] bg-[#F0EAE1]">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C]">Itens do pedido</p>
          </div>
          <div className="divide-y divide-[#E6DFD5]">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                {/* Thumbnail */}
                {item.image && (
                  <div className="w-10 h-[52px] shrink-0 overflow-hidden bg-[#F0EBE1] border border-[#E6DFD5]">
                    <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#1E1208] leading-snug">{item.productName}</p>
                  <p className="text-[11px] text-[#B09C8C] mt-0.5">
                    {item.variant.size}{item.variant.color ? ` · ${item.variant.color}` : ''}{item.variant.fabric ? ` · ${item.variant.fabric}` : ''} · ×{item.quantity}
                  </p>
                </div>
                <span className="text-[13px] font-semibold text-[#1E1208] shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between px-5 py-4 border-t border-[#E6DFD5] bg-[#F0EAE1]">
            <span className="text-[13px] font-semibold text-[#1E1208]">Total</span>
            <span className="font-display text-xl text-[#1E1208]">{formatCurrency(order.totalCents)}</span>
          </div>
        </div>

        {/* ── Pagamento + Endereço — side by side on desktop ── */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-[#FAF8F5] border border-[#E6DFD5]">
            <div className="px-5 py-3 border-b border-[#E6DFD5] bg-[#F0EAE1]">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C]">Pagamento</p>
            </div>
            <div className="px-5 py-4 flex flex-col gap-2">
              <div className="flex justify-between text-[13px]">
                <span className="text-[#B09C8C]">Método</span>
                <span className="font-semibold text-[#1E1208] uppercase">{order.payment.method}</span>
              </div>
              {order.payment.txId && (
                <div className="flex justify-between text-[12px] gap-4">
                  <span className="text-[#B09C8C] shrink-0">ID</span>
                  <span className="font-mono text-[#1E1208] truncate">{order.payment.txId}</span>
                </div>
              )}
              {order.payment.paidAt && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-[#B09C8C]">Pago em</span>
                  <span className="text-[#1E1208] tabular-nums">{formatDateTime(order.payment.paidAt)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#FAF8F5] border border-[#E6DFD5]">
            <div className="px-5 py-3 border-b border-[#E6DFD5] bg-[#F0EAE1]">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C]">Endereço de entrega</p>
            </div>
            <div className="px-5 py-4">
              <address className="text-[13px] text-[#705A48] not-italic leading-relaxed">
                {order.address.street}, {order.address.number}
                {order.address.complement ? ` · ${order.address.complement}` : ''}<br />
                {order.address.neighborhood} · {order.address.city} · {order.address.state}<br />
                CEP {order.address.cep}
              </address>
            </div>
          </div>
        </div>

        {/* ── Rastreio ── */}
        {order.delivery?.carrier && (
          <div className="bg-[#FAF8F5] border border-[#E6DFD5]">
            <div className="px-5 py-3 border-b border-[#E6DFD5] bg-[#F0EAE1]">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C]">Entrega</p>
            </div>
            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-[#1E1208]">{order.delivery.carrier}</p>
                {order.delivery.trackingCode && (
                  <p className="text-[12px] text-[#B09C8C] mt-0.5 font-mono">{order.delivery.trackingCode}</p>
                )}
              </div>
              {order.delivery.trackingCode && (
                <button
                  onClick={() => navigator.clipboard.writeText(order.delivery!.trackingCode!)}
                  className="text-[11px] font-semibold text-[#C4714A] hover:text-[#96501E] transition-colors shrink-0"
                >
                  Copiar rastreio
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
