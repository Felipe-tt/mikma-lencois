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
import { LiveDeliveryMap } from '@/components/tracking/LiveDeliveryMap';

// ─── Status steps ─────────────────────────────────────────────────────────────

// SVG ícones para cada step do progresso (sem emojis)
function StepIcon({ status, active }: { status: OrderStatus; active: boolean }) {
  const cls = `w-4 h-4 ${active ? 'stroke-[#C4714A]' : 'stroke-[#C8B8A8]'}`;
  const base = { fill: 'none' as const, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (status === 'pending_payment')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
  if (status === 'paid')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
  if (status === 'preparing')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
  if (status === 'shipped')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
  if (status === 'delivered')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><polyline points="20 6 9 17 4 12"/></svg>;
  return null;
}

// SVG ícones para timeline interna
function TimelineIcon({ status }: { status: string }) {
  const base = { fill: 'none' as const, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const cls = 'w-4 h-4 stroke-[#C4714A]';
  if (status === 'created')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>;
  if (status === 'payment_initiated' || status === 'pending_payment')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
  if (status === 'payment_confirmed' || status === 'paid')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
  if (status === 'payment_expired')
    return <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-amber-500" {...base}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
  if (status === 'payment_failed')
    return <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-red-500" {...base}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
  if (status === 'preparing')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>;
  if (status === 'shipped')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
  if (status === 'delivered')
    return <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-emerald-600" {...base}><polyline points="20 6 9 17 4 12"/></svg>;
  if (status === 'cancelled')
    return <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-red-500" {...base}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
  return <svg viewBox="0 0 24 24" className={cls} fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>;
}

const STATUS_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending_payment', label: 'Aguardando pagamento' },
  { status: 'paid',            label: 'Pagamento confirmado' },
  { status: 'preparing',       label: 'Em preparação'        },
  { status: 'shipped',         label: 'A caminho'            },
  { status: 'delivered',       label: 'Entregue'             },
];

function stepIndex(status: OrderStatus) {
  const idx = STATUS_STEPS.findIndex(s => s.status === status);
  return idx === -1 ? 0 : idx;
}

// ─── Timeline interna do pedido (eventos do Firestore) ───────────────────────

const TIMELINE_LABEL: Record<string, string> = {
  created:              'Pedido criado',
  payment_initiated:    'Aguardando pagamento',
  payment_confirmed:    'Pagamento confirmado',
  payment_expired:      'PIX expirou',
  payment_failed:       'Pagamento recusado',
  pending_payment:      'Aguardando pagamento',
  paid:                 'Pagamento confirmado',
  preparing:            'Pedido em preparação',
  shipped:              'Pedido despachado',
  delivery_cancelled:   'Entrega cancelada — novo envio em breve',
  delivered:            'Pedido entregue',
  cancelled:            'Pedido cancelado',
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
    if (!order || order.payment.method !== 'pix' || !order.payment.pixCopyPaste) return;
    navigator.clipboard.writeText(order.payment.pixCopyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (loading || !order) return <OrderDetailSkeleton />;

  const isCancelled = order.status === 'cancelled';
  const currentStep = stepIndex(order.status);
  const carrier = order.delivery?.carrier ?? null;
  const trackCode = order.delivery?.trackingCode;
  // Uber Direct: usa a trackingUrl da entrega (link em tempo real do Uber), não código
  const rastreioUrl = carrier === 'uber_direct'
    ? (order.delivery?.trackingUrl ?? null)
    : (carrier && trackCode ? trackingUrl(carrier, trackCode) : null);
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
                      : <StepIcon status={step.status} active={i === currentStep} />
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
              <button onClick={copyPix} className="btn-primary shrink-0 text-xs px-4 flex items-center gap-1.5">
                {copied
                  ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Copiado</>
                  : 'Copiar'
                }
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
                      <div className="w-8 h-8 shrink-0 flex items-center justify-center bg-[#FAF7F4] border border-mist mt-0.5">
                        <TimelineIcon status={ev.status} />
                      </div>
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

            {/* Rastreio — Correios/ME via TrackingTimeline, Uber Direct via link em tempo real */}
            {carrier && carrier !== 'pickup' && carrier !== 'manual' && carrier !== 'uber_direct' && (
              <section>
                <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">
                  Rastreamento
                </h2>
                <div className="border border-mist p-5">
                  <TrackingTimeline orderId={orderId} carrierName={carrierName(carrier)} />
                </div>
              </section>
            )}

            {/* Uber Direct — bloco em tempo real com entregador e link de rastreio */}
            {carrier === 'uber_direct' && order.status !== 'delivered' && order.status !== 'cancelled' && (
              <section>
                <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">
                  Acompanhe a entrega
                </h2>
                <div className="border border-mist p-5 flex flex-col gap-4">
                  {order.delivery?.courierName ? (
                    <div className="flex items-center gap-3">
                      {order.delivery.courierPhoto ? (
                        <img
                          src={order.delivery.courierPhoto}
                          alt={order.delivery.courierName}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <span className="w-10 h-10 rounded-full bg-[#E6DFD5] flex items-center justify-center shrink-0">
                          <svg viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="1.8" strokeLinecap="round" className="w-5 h-5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-ink">{order.delivery.courierName}</p>
                        {order.delivery.courierVehicle && (
                          <p className="text-xs text-faint capitalize">{order.delivery.courierVehicle}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-faint">Procurando entregador…</p>
                  )}
                  {order.delivery?.dropoffEta && (
                    <p className="text-xs text-faint">
                      Previsão de entrega:{' '}
                      <span className="font-semibold text-ink">
                        {new Date(order.delivery.dropoffEta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </p>
                  )}
                  <LiveDeliveryMap
                    routePoints={order.delivery?.routePoints}
                    courierLat={order.delivery?.courierLat}
                    courierLng={order.delivery?.courierLng}
                    courierLocationAt={order.delivery?.courierLocationAt}
                    courierName={order.delivery?.courierName}
                  />
                  {order.delivery?.trackingUrl && (
                    <a
                      href={order.delivery.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#1E1208] text-[#FAF8F5] text-[13px] font-semibold hover:bg-[#1E1208]/80 transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                      Abrir rastreio da Uber em outra aba
                    </a>
                  )}
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
                        Rastrear
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
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
