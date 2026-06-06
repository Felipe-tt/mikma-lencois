'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Order } from '@/types';
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

export default function PainelPedidoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
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
      const update: Record<string, unknown> = { status: next, updatedAt: serverTimestamp() };
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

  if (loading) return (
    <div className="flex flex-col gap-3">
      {[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-mist/40 animate-pulse" />)}
    </div>
  );

  if (!order) return <p className="text-sm text-faint py-8 text-center">Pedido não encontrado.</p>;

  const nextStatus = STATUS_NEXT[order.status];

  return (
    <div className="max-w-2xl">
      {/* Voltar + ID */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()}
          className="text-faint active:text-ink transition-colors p-1 -ml-1">
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
        {/* Ações */}
        {(nextStatus || order.status === 'preparing') && (
          <div className="bg-paper border border-mist rounded-xl p-4 flex flex-col gap-3">
            <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint">Gestão do pedido</p>

            {order.status === 'preparing' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-mid">Código de rastreio</label>
                <input
                  className="w-full border border-mist rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-clay/20"
                  placeholder="BR123456789BR"
                  value={trackingCode}
                  onChange={e => setTrackingCode(e.target.value)}
                />
                <button onClick={dispatchDelivery} disabled={updating}
                  className="w-full border border-mist text-sm font-medium text-mid py-3 rounded-xl active:bg-warm disabled:opacity-50 transition-colors">
                  {updating ? 'Processando…' : 'Acionar entrega automática'}
                </button>
              </div>
            )}

            {nextStatus && (
              <button onClick={advanceStatus} disabled={updating}
                className="w-full bg-ink text-paper text-sm font-semibold py-3.5 rounded-xl disabled:opacity-50 active:bg-ink/80 transition-colors">
                {updating ? 'Salvando…' : `Avançar → ${STATUS_LABELS[nextStatus]}`}
              </button>
            )}
          </div>
        )}

        {/* Itens */}
        <div className="bg-paper border border-mist rounded-xl p-4">
          <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Itens do pedido</p>
          <div className="flex flex-col divide-y divide-mist">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between items-center py-3 gap-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink leading-snug">{item.productName}</p>
                  <p className="text-xs text-faint mt-0.5">
                    {item.variant.size}{item.variant.color ? ` · ${item.variant.color}` : ''} · ×{item.quantity}
                  </p>
                </div>
                <span className="text-sm font-semibold text-ink shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-3 mt-1 border-t border-mist">
            <span className="text-sm font-semibold text-ink">Total</span>
            <span className="font-display text-xl text-ink">{formatCurrency(order.totalCents)}</span>
          </div>
        </div>

        {/* Endereço */}
        <div className="bg-paper border border-mist rounded-xl p-4">
          <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint mb-2">Endereço de entrega</p>
          <address className="text-sm text-mid not-italic leading-relaxed">
            {order.address.street}, {order.address.number}
            {order.address.complement ? ` — ${order.address.complement}` : ''}<br />
            {order.address.neighborhood} · {order.address.city} — {order.address.state}<br />
            CEP {order.address.cep}
          </address>
        </div>

        {/* Rastreio */}
        {order.delivery?.carrier && (
          <div className="bg-paper border border-mist rounded-xl p-4">
            <p className="text-2xs font-bold tracking-[0.15em] uppercase text-faint mb-2">Entrega</p>
            <p className="text-sm font-medium text-ink">{order.delivery.carrier}</p>
            {order.delivery.trackingCode && (
              <p className="text-xs text-faint mt-1">
                Rastreio: <span className="font-mono text-ink">{order.delivery.trackingCode}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
