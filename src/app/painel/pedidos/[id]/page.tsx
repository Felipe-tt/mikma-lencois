'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Order } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';

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

function PedidoDetalheLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="flex flex-col gap-5">
        {[160, 200, 140, 120].map((h, i) => (
          <Skeleton key={i} className={`h-${h / 4} w-full`} />
        ))}
      </div>
    </div>
  );
}

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
      router.push('/entrar');
      return;
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
    } finally {
      setUpdating(false);
    }
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
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <PedidoDetalheLoading />;
  if (!order) return (
    <div className="p-8">
      <p className="text-sm text-faint">Pedido não encontrado.</p>
    </div>
  );

  const nextStatus = STATUS_NEXT[order.status];

  return (
    <div className="p-6 sm:p-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="text-sm text-faint hover:text-ink transition-colors inline-flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Voltar
        </button>
        <h1 className="font-display font-normal text-ink text-xl">
          Pedido #{order.id.slice(-8).toUpperCase()}
        </h1>
        <span className={STATUS_BADGE[order.status] ?? 'badge badge-pending'}>
          {STATUS_LABELS[order.status]}
        </span>
      </div>

      <div className="flex flex-col gap-5">
        {/* Ações de status */}
        <div className="border border-mist bg-paper p-5 flex flex-col gap-4">
          <h2 className="text-2xs font-semibold tracking-[0.15em] uppercase text-faint">Gestão do pedido</h2>

          {order.status === 'preparing' && (
            <div className="flex flex-col gap-2">
              <label className="label">Código de rastreio</label>
              <input
                className="input"
                placeholder="BR123456789BR"
                value={trackingCode}
                onChange={e => setTrackingCode(e.target.value)}
              />
              <button
                onClick={dispatchDelivery}
                disabled={updating}
                className="btn-outline text-sm mt-1"
              >
                {updating ? 'Processando…' : 'Acionar entrega (Uber Direct / Melhor Envio)'}
              </button>
            </div>
          )}

          {nextStatus && (
            <button
              onClick={advanceStatus}
              disabled={updating}
              className="btn-primary text-sm"
            >
              {updating ? 'Salvando…' : `Avançar para: ${STATUS_LABELS[nextStatus]}`}
            </button>
          )}

          {!nextStatus && order.status !== 'cancelled' && (
            <p className="text-xs text-faint">Pedido finalizado — nenhuma ação disponível.</p>
          )}
        </div>

        {/* Itens */}
        <div className="border border-mist bg-paper p-5">
          <h2 className="text-2xs font-semibold tracking-[0.15em] uppercase text-faint mb-4">Itens do pedido</h2>
          <div className="flex flex-col divide-y divide-mist">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between items-center py-3 gap-4 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{item.productName}</p>
                  <p className="text-xs text-faint mt-0.5">
                    {item.variant.size}{item.variant.color ? ` · ${item.variant.color}` : ''} · ×{item.quantity}
                  </p>
                </div>
                <span className="text-sm font-semibold text-ink shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-4 mt-2 border-t border-mist">
            <span className="text-sm font-semibold text-ink">Total</span>
            <span className="font-display text-xl text-ink">{formatCurrency(order.totalCents)}</span>
          </div>
        </div>

        {/* Endereço */}
        <div className="border border-mist bg-paper p-5">
          <h2 className="text-2xs font-semibold tracking-[0.15em] uppercase text-faint mb-3">Endereço de entrega</h2>
          <address className="text-sm text-mid not-italic leading-relaxed">
            {order.address.street}, {order.address.number}
            {order.address.complement ? ` — ${order.address.complement}` : ''}<br />
            {order.address.neighborhood} · {order.address.city} — {order.address.state}<br />
            CEP {order.address.cep}
          </address>
        </div>

        {/* Entrega */}
        {order.delivery?.carrier && (
          <div className="border border-mist bg-paper p-5">
            <h2 className="text-2xs font-semibold tracking-[0.15em] uppercase text-faint mb-3">Entrega</h2>
            <p className="text-sm text-mid">
              <span className="text-ink font-medium">{order.delivery.carrier}</span>
            </p>
            {order.delivery.trackingCode && (
              <p className="text-xs text-faint mt-1">Rastreio: <span className="font-mono text-ink">{order.delivery.trackingCode}</span></p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
