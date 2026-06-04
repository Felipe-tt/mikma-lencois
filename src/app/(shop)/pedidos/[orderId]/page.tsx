'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { db } from '@/lib/firebase/client';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Order, OrderStatus } from '@/types';
import { formatCurrency, formatTs, formatTsDateTime } from '@/lib/utils/format';

const STATUS_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending_payment', label: 'Aguardando pagamento' },
  { status: 'paid', label: 'Pagamento confirmado' },
  { status: 'preparing', label: 'Em preparo' },
  { status: 'shipped', label: 'Em rota' },
  { status: 'delivered', label: 'Entregue' },
];

function stepIndex(status: OrderStatus) {
  const idx = STATUS_STEPS.findIndex(s => s.status === status);
  return idx === -1 ? 0 : idx;
}

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/entrar');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !orderId) return;
    return onSnapshot(doc(db, 'orders', orderId), snap => {
      if (snap.exists()) setOrder({ id: snap.id, ...snap.data() } as Order);
    });
  }, [user, orderId]);

  function copyPix() {
    if (!order?.payment.pixCopyPaste) return;
    navigator.clipboard.writeText(order.payment.pixCopyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (loading || !order) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <span className="spinner" />
      </div>
    );
  }

  const currentStep = stepIndex(order.status);
  const isCancelled = order.status === 'cancelled';

  return (
    <div>
      <div className="page-header">
        <div className="container-shop">
          <span className="eyebrow mb-3 block">Pedido</span>
          <h1 className="font-display font-normal text-ink" style={{ fontSize: 'clamp(1.75rem,4vw,2.75rem)' }}>
            #{order.id.slice(-8).toUpperCase()}
          </h1>
        </div>
      </div>

      <div className="container-shop py-10 max-w-3xl">

        {/* Progress */}
        {!isCancelled && (
          <div className="mb-10 flex items-start gap-0">
            {STATUS_STEPS.map((step, i) => (
              <div key={step.status} className="flex-1 flex flex-col items-center relative">
                {/* line before */}
                {i > 0 && (
                  <div className={`absolute top-3 right-1/2 w-full h-px ${i <= currentStep ? 'bg-clay' : 'bg-mist'}`} />
                )}
                <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  i < currentStep ? 'bg-clay border-clay text-paper'
                  : i === currentStep ? 'bg-paper border-clay text-clay'
                  : 'bg-paper border-mist text-faint'
                }`}>
                  {i < currentStep ? '✓' : i + 1}
                </div>
                <span className={`mt-2 text-xs text-center leading-tight ${i <= currentStep ? 'text-ink font-medium' : 'text-faint'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {isCancelled && (
          <div className="mb-8 bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700 font-medium">
            Pedido cancelado
          </div>
        )}

        {/* PIX pending payment */}
        {order.status === 'pending_payment' && order.payment.pixCopyPaste && (
          <div className="mb-8 border border-mist bg-warm p-6 flex flex-col items-center gap-4">
            <p className="text-sm font-semibold text-ink">Pague para confirmar o pedido</p>
            <p className="text-xs text-mid">
              Total: <span className="font-bold text-ink">{formatCurrency(order.totalCents)}</span>
            </p>
            {order.payment.pixQrCode && (
              <img src={order.payment.pixQrCode} alt="QR Code PIX" className="w-44 h-44 border border-mist" />
            )}
            <div className="w-full flex gap-2">
              <input readOnly value={order.payment.pixCopyPaste}
                className="input flex-1 text-xs truncate" />
              <button onClick={copyPix} className="btn-primary shrink-0 text-xs px-4">
                {copied ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-8 items-start">
          {/* Items */}
          <section>
            <h2 className="font-display font-normal text-ink text-xl mb-4">Itens do pedido</h2>
            <div className="flex flex-col divide-y divide-mist border border-mist">
              {order.items.map(item => (
                <div key={item.sku} className="flex justify-between items-center px-5 py-4 gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink">{item.productName}</p>
                    <p className="text-xs text-faint mt-0.5">
                      {item.variant.size}{item.variant.color ? ` · ${item.variant.color}` : ''}
                      {item.variant.fabric ? ` · ${item.variant.fabric}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-faint">×{item.quantity}</p>
                    <p className="text-sm font-semibold text-ink">{formatCurrency(item.unitPrice * item.quantity)}</p>
                  </div>
                </div>
              ))}
              {order.discountCents != null && order.discountCents > 0 && (
                <div className="flex justify-between px-5 py-3 text-sm text-green-700">
                  <span>Desconto</span>
                  <span>− {formatCurrency(order.discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between px-5 py-4 font-semibold text-ink">
                <span>Total</span>
                <span className="font-display text-xl">{formatCurrency(order.totalCents)}</span>
              </div>
            </div>
          </section>

          {/* Sidebar */}
          <aside className="flex flex-col gap-5">
            <section className="border border-mist p-5">
              <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Endereço</h2>
              <address className="text-sm text-mid not-italic leading-relaxed">
                {order.address.street}, {order.address.number}
                {order.address.complement && ` — ${order.address.complement}`}<br />
                {order.address.neighborhood}, {order.address.city} — {order.address.state}<br />
                CEP {order.address.cep}
              </address>
            </section>

            {order.delivery?.carrier && (
              <section className="border border-mist p-5">
                <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Entrega</h2>
                <p className="text-sm text-ink capitalize">{order.delivery.carrier.replace(/_/g, ' ')}</p>
                {order.delivery.trackingCode && (
                  <p className="text-xs text-mid mt-1">Rastreio: <strong className="font-mono text-ink">{order.delivery.trackingCode}</strong></p>
                )}
                {order.delivery.dispatchedAt && (
                  <p className="text-xs text-faint mt-1">Despachado em {formatTs(order.delivery.dispatchedAt)}</p>
                )}
              </section>
            )}

            <section className="border border-mist p-5">
              <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Pagamento</h2>
              <p className="text-sm text-ink">PIX</p>
              {order.payment.paidAt && (
                <p className="text-xs text-faint mt-1">Confirmado em {formatTsDateTime(order.payment.paidAt)}</p>
              )}
            </section>

            <p className="text-xs text-faint px-1">Pedido em {formatTsDateTime(order.createdAt)}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
