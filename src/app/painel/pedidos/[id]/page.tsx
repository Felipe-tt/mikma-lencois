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

  if (loading) return <div className="p-8 text-sm text-gray-400">Carregando...</div>;
  if (!order) return <div className="p-8 text-sm text-gray-400">Pedido não encontrado.</div>;

  const nextStatus = STATUS_NEXT[order.status];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-900">
          ← Voltar
        </button>
        <h1 className="text-xl font-semibold text-gray-900">
          Pedido #{order.id.slice(-8).toUpperCase()}
        </h1>
      </div>

      {/* Status */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Status atual</span>
          <span className="text-sm font-semibold text-gray-900">{STATUS_LABELS[order.status]}</span>
        </div>

        {order.status === 'preparing' && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Código de rastreio</label>
            <input
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="BR123456789BR"
              value={trackingCode}
              onChange={e => setTrackingCode(e.target.value)}
            />
            <button
              onClick={dispatchDelivery}
              disabled={updating}
              className="w-full border border-blue-300 bg-blue-50 text-blue-700 rounded-md py-2 text-sm font-medium hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              {updating ? 'Processando…' : 'Acionar entrega (Uber Direct / Melhor Envio)'}
            </button>
          </div>
        )}

        {nextStatus && (
          <button
            onClick={advanceStatus}
            disabled={updating}
            className="w-full border border-green-300 bg-green-50 text-green-700 rounded-md py-2 text-sm font-medium hover:bg-green-100 disabled:opacity-50 transition-colors"
          >
            {updating ? 'Salvando…' : `Avançar para: ${STATUS_LABELS[nextStatus]}`}
          </button>
        )}
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Itens do pedido</h2>
        <div className="space-y-3">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-sm text-gray-900">{item.productName}</p>
                <p className="text-xs text-gray-500">
                  {item.variant.size}{item.variant.color ? ` · ${item.variant.color}` : ''} · Qtd: {item.quantity}
                </p>
              </div>
              <span className="text-sm font-medium text-gray-900">{formatCurrency(item.unitPrice * item.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between pt-3 font-semibold text-gray-900 border-t border-gray-100 mt-2">
          <span>Total</span>
          <span>{formatCurrency(order.totalCents)}</span>
        </div>
      </div>

      {/* Endereço */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Endereço de entrega</h2>
        <address className="text-sm text-gray-600 not-italic space-y-1">
          <p>{order.address.street}, {order.address.number}{order.address.complement ? ` — ${order.address.complement}` : ''}</p>
          <p>{order.address.neighborhood} · {order.address.city} — {order.address.state}</p>
          <p>CEP {order.address.cep}</p>
        </address>
      </div>

      {/* Entrega */}
      {order.delivery?.carrier && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Entrega</h2>
          <div className="space-y-1 text-sm text-gray-600">
            <p>Transportadora: <span className="text-gray-900">{order.delivery.carrier}</span></p>
            {order.delivery.trackingCode && (
              <p>Rastreio: <span className="text-gray-900 font-mono">{order.delivery.trackingCode}</span></p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
