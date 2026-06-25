'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { db } from '@/lib/firebase/client';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Order, OrderStatus } from '@/types';
import { formatCurrency, formatTs, formatTsDateTime } from '@/lib/utils/format';
import { carrierName, trackingUrl } from '@/lib/carriers';
import { OrderDetailSkeleton } from '@/components/ui/Skeleton';
import { TrackingTimeline } from '@/components/tracking/TrackingTimeline';

// ─── Status steps ─────────────────────────────────────────────────────────────

const STATUS_STEPS: { status: OrderStatus; label: string; icon: string }[] = [
  { status: 'pending_payment', label: 'Aguardando pagamento', icon: '⏳' },
  { status: 'paid',            label: 'Pagamento confirmado', icon: '✓'  },
  { status: 'preparing',       label: 'Em preparação',        icon: '📦' },
  { status: 'shipped',         label: 'A caminho',            icon: '🚚' },
  { status: 'delivered',       label: 'Entregue',             icon: '🎉' },
];

function stepIndex(status: OrderStatus) {
  const idx = STATUS_STEPS.findIndex(s => s.status === status);
  return idx === -1 ? 0 : idx;
}

// ─── Timeline interna do pedido (eventos do Firestore) ───────────────────────

const TIMELINE_LABEL: Record<string, string> = {
  created:           'Pedido criado',
  payment_initiated: 'Aguardando pagamento',
  payment_confirmed: 'Pagamento confirmado',
  payment_expired:   'PIX expirou',
  payment_failed:    'Pagamento recusado',
  pending_payment:   'Aguardando pagamento',
  paid:              'Pagamento confirmado',
  preparing:         'Pedido em preparação',
  shipped:           'Pedido despachado',
  delivered:         'Pedido entregue',
  cancelled:         'Pedido cancelado',
};

const TIMELINE_ICON: Record<string, string> = {
  created: '🛍', payment_initiated: '⏳', payment_confirmed: '✅',
  payment_expired: '⌛', payment_failed: '❌', pending_payment: '⏳',
  paid: '✅', preparing: '📦', shipped: '🚚', delivered: '🎉', cancelled: '✕',
};

// ─── Component ────────────────────────────────────────────────────────────────

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

  if (loading || !order) return <OrderDetailSkeleton />;

  const isCancelled = order.status === 'cancelled';
  const currentStep = stepIndex(order.status);
  const carrier = order.delivery?.carrier ?? null;
  const trackCode = order.delivery?.trackingCode;
  const rastreioUrl = carrier && trackCode ? trackingUrl(carrier, trackCode) : null;
  const timeline = [...(order.timeline ?? [])].reverse();

  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop">
          <span className="eyebrow mb-3 block">Meus pedidos</span>
          <div className="flex items-center gap-3 flex-wrap pb-1">
            <h1 className="font-display font-normal text-ink">
              #{order.id.slice(-8).toUpperCase()}
            </h1>
            {isCancelled && (
              <span className="text-xs font-bold text-red-600 border border-red-200 bg-red-50 px-2.5 py-1">
                Cancelado
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="container-shop py-8 max-w-3xl">

        {/* ── Progress bar ─────────────────────────────────────────── */}
        {!isCancelled && (
          <div className="mb-10">
            {/* Steps */}
            <div className="flex items-start">
              {STATUS_STEPS.map((step, i) => (
                <div key={step.status} className="flex-1 flex flex-col items-center relative">
                  {/* linha conectora */}
                  {i > 0 && (
                    <div className={`absolute top-[18px] right-1/2 w-full h-[2px] ${
                      i <= currentStep ? 'bg-[#C4714A]' : 'bg-[#E6DFD5]'
                    }`} />
                  )}
                  {/* círculo */}
                  <div className={`relative z-10 w-9 h-9 flex items-center justify-center text-sm border-2 transition-all ${
                    i < currentStep
                      ? 'bg-[#C4714A] border-[#C4714A] text-white'
                      : i === currentStep
                        ? 'bg-white border-[#C4714A] text-[#C4714A] shadow-sm'
                        : 'bg-white border-[#E6DFD5] text-[#C8B8A8]'
                  }`}>
                    {i < currentStep
                      ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      : <span className="text-[13px]">{step.icon}</span>
                    }
                  </div>
                  {/* label */}
                  <span className={`mt-2 text-[11px] text-center leading-tight px-1 ${
                    i <= currentStep ? 'text-[#1E1208] font-medium' : 'text-[#C8B8A8]'
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PIX pendente ─────────────────────────────────────────── */}
        {order.status === 'pending_payment' && order.payment.method === 'pix' && order.payment.pixCopyPaste && (
          <div className="mb-8 border border-amber-200 bg-amber-50/50 p-6 flex flex-col items-center gap-4">
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

          {/* ── Coluna principal ──────────────────────────────────── */}
          <div className="flex flex-col gap-6">

            {/* Itens */}
            <section>
              <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Itens</h2>
              <div className="flex flex-col divide-y divide-mist border border-mist">
                {order.items.map(item => (
                  <div key={item.sku} className="flex justify-between items-center px-5 py-4 gap-4">
                    <div>
                      <p className="text-sm font-medium text-ink">{item.productName}</p>
                      <p className="text-xs text-faint mt-0.5">
                        {item.variant.size}
                        {item.variant.color ? ` · ${item.variant.color}` : ''}
                        {item.variant.fabric ? ` · ${item.variant.fabric}` : ''}
                        {' · '}{item.quantity}x
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-ink shrink-0">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}
                {(order.discountCents ?? 0) > 0 && (
                  <div className="flex justify-between px-5 py-3 text-sm text-emerald-700">
                    <span>Desconto{order.couponCode ? ` (${order.couponCode})` : ''}</span>
                    <span>− {formatCurrency(order.discountCents!)}</span>
                  </div>
                )}
                <div className="flex justify-between px-5 py-4 font-semibold text-ink">
                  <span>Total</span>
                  <span className="font-display text-xl">{formatCurrency(order.totalCents)}</span>
                </div>
              </div>
            </section>

            {/* Timeline interna do pedido */}
            {timeline.length > 0 && (
              <section>
                <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Histórico</h2>
                <div className="border border-mist divide-y divide-mist">
                  {timeline.map((ev, i) => (
                    <div key={i} className="flex items-start gap-4 px-5 py-4">
                      <span className="text-lg shrink-0 mt-0.5">{TIMELINE_ICON[ev.status] ?? '•'}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-ink">
                          {TIMELINE_LABEL[ev.status] ?? ev.status}
                        </p>
                        {ev.note && (
                          <p className="text-xs text-mid mt-0.5">{ev.note}</p>
                        )}
                        <p className="text-xs text-faint mt-0.5 tabular-nums">
                          {formatTsDateTime(ev.at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Rastreio Correios (só quando for Correios) */}
            {carrier && carrier !== 'pickup' && carrier !== 'disk_tenha' && carrier !== 'manual' && (
              <section>
                <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">
                  Rastreamento
                </h2>
                <div className="border border-mist p-5">
                  <TrackingTimeline orderId={orderId} carrierName={carrierName(carrier)} />
                </div>
              </section>
            )}
          </div>

          {/* ── Sidebar ───────────────────────────────────────────── */}
          <aside className="flex flex-col gap-4">

            {/* Entrega */}
            {carrier && carrier !== 'pickup' && (
              <section className="border border-mist p-5">
                <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Entrega</h2>
                <p className="text-sm font-medium text-ink">{carrierName(carrier)}</p>
                {order.delivery?.dispatchedAt && (
                  <p className="text-xs text-faint mt-1">
                    Despachado em {formatTs(order.delivery.dispatchedAt)}
                  </p>
                )}
                {trackCode && (
                  <div className="mt-3 pt-3 border-t border-mist">
                    <p className="text-xs text-faint mb-1">Código de rastreio</p>
                    <p className="font-mono text-sm font-bold text-ink">{trackCode}</p>
                    {rastreioUrl && (
                      <a
                        href={rastreioUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors"
                      >
                        Rastrear →
                      </a>
                    )}
                  </div>
                )}
              </section>
            )}

            {carrier === 'pickup' && (
              <section className="border border-mist p-5">
                <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-2">Entrega</h2>
                <p className="text-sm text-ink">Retirada na loja</p>
              </section>
            )}

            {/* Endereço */}
            <section className="border border-mist p-5">
              <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Endereço</h2>
              <address className="text-sm text-mid not-italic leading-relaxed">
                {order.address.street}, {order.address.number}
                {order.address.complement && ` · ${order.address.complement}`}<br />
                {order.address.neighborhood}, {order.address.city} · {order.address.state}<br />
                CEP {order.address.cep}
              </address>
            </section>

            {/* Pagamento */}
            <section className="border border-mist p-5">
              <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Pagamento</h2>
              <p className="text-sm text-ink capitalize">{order.payment.method === 'pix' ? 'PIX' : 'Cartão de crédito'}</p>
              {order.payment.paidAt && (
                <p className="text-xs text-faint mt-1">
                  Confirmado em {formatTsDateTime(order.payment.paidAt)}
                </p>
              )}
            </section>

            <p className="text-xs text-faint px-1">
              Pedido em {formatTsDateTime(order.createdAt)}
            </p>
          </aside>

        </div>
      </div>
    </div>
  );
}
