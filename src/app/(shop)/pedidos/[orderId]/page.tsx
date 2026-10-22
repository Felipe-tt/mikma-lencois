'use client';
import { userMessage } from '@/lib/userMessage';
import { PixPayBlock, PaidCheck } from '@/components/checkout/PIXModal';
import { groupConsecutiveDays, parseBusinessHours } from '@/lib/business-hours';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';

import { db } from '@/lib/firebase/client';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Order, OrderStatus } from '@/types';
import { formatCurrency, formatTs, formatTsDateTime } from '@/lib/utils/format';
import { carrierName, trackingUrl, isCorreios } from '@/lib/carriers';
import { OrderDetailSkeleton } from '@/components/ui/Skeleton';
import { TrackingTimeline } from '@/components/tracking/TrackingTimeline';
import { useUberSync } from '@/components/tracking/useUberSync';
import { UberTracking } from '@/components/tracking/UberTracking';
import { toAddress, streetLine } from '@/lib/address';
import { customerTimeline, customerCancelReason } from '@/lib/orders/customerTimeline';
import { variantLabel } from '@/lib/variantLabel';
import { trackPurchase } from '@/lib/analytics';
import { requestNewPix, type NewPix } from '@/lib/orders/requestNewPix';
import { setReturnTo } from '@/lib/auth/returnTo';
import { EmptyState } from '@/components/ui/EmptyState';
import { PIXModal } from '@/components/checkout/PIXModal';

// ─── Status steps ─────────────────────────────────────────────────────────────

// SVG ícones para cada step do progresso (sem emojis)
function StepIcon({ status, active }: { status: OrderStatus; active: boolean }) {
  const cls = `w-4 h-4 ${active ? 'stroke-clay-l' : 'stroke-faint-l'}`;
  const base = { fill: 'none' as const, stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
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

// SVG ícones para timeline interna — sempre currentColor, a cor vem do
// badge (mesmo padrão da timeline do painel, ver TIMELINE_ICON_COMP em
// /painel/pedidos/[id]/page.tsx).
function TimelineIcon({ status }: { status: string }) {
  const base = { fill: 'none' as const, stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  const cls = 'w-4 h-4';
  if (status === 'created')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>;
  if (status === 'payment_initiated' || status === 'pending_payment')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
  if (status === 'payment_confirmed' || status === 'paid')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
  if (status === 'payment_expired')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
  if (status === 'payment_failed')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
  if (status === 'preparing')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>;
  if (status === 'shipped')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
  if (status === 'delivered')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><polyline points="20 6 9 17 4 12"/></svg>;
  if (status === 'cancelled')
    return <svg viewBox="0 0 24 24" className={cls} {...base}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={cls} fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>;
}

// Mesma paleta usada na timeline do painel (TIMELINE_TONE em
// /painel/pedidos/[id]/page.tsx) — fundo pastel + texto colorido, não
// círculo sólido. Só o evento mais recente usa a cor do status; os
// anteriores ficam neutros, evita efeito confete numa lista longa.
const TIMELINE_TONE: Record<string, string> = {
  created:            'bg-stone-100 text-stone-500',
  payment_initiated:  'bg-warm text-mid',
  payment_confirmed:  'bg-emerald-50 text-emerald-700',
  payment_expired:    'bg-amber-50 text-amber-700',
  payment_failed:     'bg-red-50 text-red-700',
  pending_payment:    'bg-amber-50 text-amber-700',
  paid:               'bg-emerald-50 text-emerald-700',
  preparing:          'bg-clay/10 text-clay',
  shipped:            'bg-clay/10 text-clay',
  delivery_cancelled: 'bg-amber-50 text-amber-700',
  delivered:          'bg-emerald-50 text-emerald-700',
  cancelled:          'bg-red-50 text-red-700',
};
const TIMELINE_TONE_MUTED = 'bg-warm text-faint ring-1 ring-inset ring-mist';

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


// ─── Component ────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  // Convidado ("comprar sem cadastro") também vê o próprio pedido.
  const { buyer: user, isGuest, loading, logout } = useAuth();
  // Pedido ainda não liberado para esta conta (o convidado acabou de entrar
  // e a passagem dos pedidos está terminando): tenta de novo algumas vezes.
  const [listenTry, setListenTry] = useState(0);
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  useUberSync(
    order?.id,
    order?.delivery?.carrier === 'uber_direct' && !!order.delivery.uberDirectDeliveryId && order.status === 'shipped',
    user,
  );
  const [pixTimeUp, setPixTimeUp] = useState(false);
  // Tempo do PIX acabou com a página aberta: pede para o servidor conferir na
  // AbacatePay. Se não foi pago, o pedido expira e o estoque volta na hora
  // (antes ficava reservado até a limpeza de 48h).
  const askedExpiry = useRef(false);
  const prevStatus = useRef<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  const [storeWa, setStoreWa] = useState<string | null>(null);
  const [store, setStore] = useState<{ address: string; city: string; hours: { label: string; text: string }[] } | null>(null);
  useEffect(() => {
    fetch('/api/settings/public').then(r => r.json()).then(d => {
      const url = d.whatsappUrl || (d.storePhone ? `https://wa.me/55${String(d.storePhone).replace(/\D/g, '').replace(/^55/, '')}` : null);
      setStoreWa(url);
      const street = [d.storeAddress, d.storeNumber].filter(Boolean).join(', ');
      const city = [d.storeNeighborhood, [d.storeCity, d.storeState].filter(Boolean).join(' · ')].filter(Boolean).join(', ');
      setStore({
        address: street,
        city: [city, d.storeCep ? `CEP ${String(d.storeCep).replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : ''].filter(Boolean).join(' · '),
        hours: d.businessHours ? groupConsecutiveDays(parseBusinessHours(d.businessHours)) : [],
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!order || order.payment.method !== 'pix' || order.status !== 'pending_payment') return;
    const raw = order.payment.expiresAt as { toDate?: () => Date } | string | undefined;
    const d = typeof raw === 'string' ? new Date(raw) : raw?.toDate?.();
    if (!d || Number.isNaN(d.getTime())) return;
    // Já vencido ao abrir: marca na próxima volta (dispara a conferência abaixo).
    const ms = Math.max(0, d.getTime() - Date.now());
    const id = setTimeout(() => setPixTimeUp(true), ms + 500);
    return () => clearTimeout(id);
  }, [order]);

  useEffect(() => {
    if (!pixTimeUp || !order || order.status !== 'pending_payment' || askedExpiry.current || !user) return;
    askedExpiry.current = true;
    user.getIdToken().then(token => fetch(`/api/orders/${order.id}/check-payment`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).catch(() => {});
  }, [pixTimeUp, order, user]);

  const [confirmingReceived, setConfirmingReceived] = useState(false);
  const [confirmReceivedError, setConfirmReceivedError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [newPix, setNewPix] = useState<NewPix | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixError, setPixError] = useState('');

  useEffect(() => {
    // Link do e-mail ("Gerar novo PIX", "Pedido enviado"): depois do login
    // o cliente volta pra este pedido, não pra home.
    if (!loading && !user) { setReturnTo(window.location.pathname); router.replace('/entrar'); }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !orderId) return;
    return onSnapshot(doc(db, 'orders', orderId), snap => {
      if (!snap.exists()) { setNotFound(true); return; }
      const data = { id: snap.id, ...snap.data() } as Order;
      // Pago com a página aberta: mostra a confirmação animada no lugar do PIX.
      const was = prevStatus.current;
      prevStatus.current = data.status;
      if ((was === 'pending_payment' || was === 'payment_expired') && data.status === 'paid') setJustPaid(true);
      // Voltou do pagamento com cartão já aprovado (?pago=1): mesma confirmação.
      if (was === null && data.status === 'paid' && new URLSearchParams(window.location.search).get('pago') === '1') {
        setJustPaid(true);
        window.history.replaceState(null, '', window.location.pathname);
      }
      setOrder(data);
      if (data.status === 'paid' || data.status === 'preparing' || data.status === 'shipped' || data.status === 'delivered') {
        trackPurchase({
          orderId: data.id,
          totalCents: data.totalCents,
          items: data.items.map(i => ({ sku: i.sku, productId: i.productId, productName: i.productName, unitPriceCents: i.unitPrice, quantity: i.quantity })),
        });
      }
    }, () => {
      // Sem permissão: pedido de outra conta, ou ainda passando do convidado.
      if (listenTry < 2) setTimeout(() => setListenTry(n => n + 1), 2500);
      else setNotFound(true);
    });
  }, [user, orderId, listenTry]);


  async function generatePix() {
    if (!order) return;
    setPixLoading(true);
    setPixError('');
    try {
      setNewPix(await requestNewPix(order.id));
    } catch (err) {
      setPixError(userMessage(err, 'Não foi possível gerar o PIX. Tente novamente.'));
    } finally {
      setPixLoading(false);
    }
  }

  async function confirmReceived() {
    if (!order || !user) return;
    if (!window.confirm('Confirmar que você já recebeu este pedido? Isso marca o pedido como entregue.')) return;

    setConfirmingReceived(true);
    setConfirmReceivedError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/orders/${order.id}/confirm-received`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConfirmReceivedError(data.error ?? 'Não foi possível confirmar. Tente de novo.');
        return;
      }
      // onSnapshot já ativo na página atualiza a tela sozinho.
    } catch {
      setConfirmReceivedError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setConfirmingReceived(false);
    }
  }

  if (notFound) return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <EmptyState
        title="Pedido não encontrado"
        description="Confira se você entrou com a mesma conta usada na compra."
        actions={[{ label: 'Meus pedidos', href: '/conta/pedidos', variant: 'primary' }]}
      />
    </div>
  );
  if (loading || !order) return <OrderDetailSkeleton />;

  const isCancelled = order.status === 'cancelled';
  const currentStep = stepIndex(order.status);
  const carrier = order.delivery?.carrier ?? null;
  const trackCode = order.delivery?.trackingCode;
  // Pra Correios (PAC/SEDEX), rastreia direto pelo código (Link&Track).
  // Outras transportadoras usam o orderId (a API devolve o código salvo
  // no pedido e o link de rastreio da transportadora).
  const useCorreiosTracking = !!carrier && isCorreios(carrier) && !!trackCode;
  // Uber Direct: usa a trackingUrl da entrega (link em tempo real do Uber), não código
  const rastreioUrl = carrier === 'uber_direct'
    ? (order.delivery?.trackingUrl ?? null)
    : (carrier && trackCode ? trackingUrl(carrier, trackCode) : null);
  const timeline = customerTimeline(order.timeline).reverse();

  // Quando o pedido já foi despachado, rastrear é a informação que o
  // cliente abriu a página pra ver, não devia ficar escondido depois
  // da lista de itens e do histórico. Promove pro topo nesses casos.
  // Vencimento do PIX (Timestamp do Firestore ou ISO). Quando passa, a tela
  // já oferece um novo código, sem esperar o servidor marcar como expirado.
  const pixExpiresIso = (() => {
    if (order.payment.method !== 'pix') return undefined;
    const raw = order.payment.expiresAt as { toDate?: () => Date } | string | undefined;
    const d = typeof raw === 'string' ? new Date(raw) : raw?.toDate?.();
    return d && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;
  })();
  const pixExpired = pixTimeUp || (!!pixExpiresIso && new Date(pixExpiresIso).getTime() <= Date.now());

  const trackingIsPriority = !!carrier && (order.status === 'shipped' || order.status === 'delivered');
  // Pedido a caminho com rastreio dos Correios/Jadlog: código, "Rastrear" e
  // "Já recebi" sobem para o bloco do topo. No celular eles ficavam no fim
  // da página, depois de itens, histórico e ajuda.
  const trackingOnTop = trackingIsPriority && carrier !== 'pickup' && carrier !== 'manual' && carrier !== 'uber_direct';

  const trackingSection = (
    <>
      {/* Rastreio, Correios/Jadlog via TrackingTimeline, Uber Direct via link em tempo real */}
      {carrier && carrier !== 'pickup' && carrier !== 'manual' && carrier !== 'uber_direct' && (
        <section>
          <h2 className="font-sans text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">
            Rastreamento
          </h2>
          <div className="rounded-2xl border border-mist p-5">
            {trackingOnTop && (trackCode || order.status === 'shipped') && (
              <div className="flex flex-col gap-3 pb-4 mb-4 border-b border-mist">
                {trackCode && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-xs text-faint">{carrierName(carrier)} · código de rastreio</p>
                      <p className="font-mono text-sm font-bold text-ink">{trackCode}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <CopyCode code={trackCode} />
                      {rastreioUrl && (
                        <a href={rastreioUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center h-9 px-3.5 rounded-full border border-mist-d text-[12.5px] font-medium text-ink hover:border-ink transition-colors">
                          Rastrear
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {order.status === 'shipped' && (
                  <div>
                    <button
                      onClick={confirmReceived}
                      disabled={confirmingReceived}
                      className="w-full sm:w-auto sm:px-6 rounded-full bg-ink text-paper text-[13px] font-bold py-2.5 hover:bg-ink/80 disabled:opacity-50 transition-colors"
                    >
                      {confirmingReceived ? 'Confirmando…' : 'Já recebi meu pedido'}
                    </button>
                    <p className="text-[11px] text-faint mt-2 leading-relaxed">
                      Confirme aqui se o pedido já chegou, mesmo antes da transportadora atualizar o status sozinha.
                    </p>
                    {confirmReceivedError && <p role="alert" className="text-[12px] text-red-600 mt-2">{confirmReceivedError}</p>}
                  </div>
                )}
              </div>
            )}
            <TrackingTimeline
              trackingCode={useCorreiosTracking ? trackCode : undefined}
              orderId={useCorreiosTracking ? undefined : orderId}
              carrierName={carrierName(carrier)}
            />
          </div>
        </section>
      )}

      {/* Uber Direct, bloco em tempo real com entregador e link de rastreio.
          Só depois que a loja despachou e a corrida existe: antes disso
          (PIX pendente, pago, separando) não há entregador para procurar. */}
      {carrier === 'uber_direct' && order.status === 'shipped' && !!order.delivery?.uberDirectDeliveryId && (
        <section>
          <h2 className="font-sans text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">
            Acompanhe a entrega
          </h2>
          <UberTracking delivery={order.delivery} audience="cliente" addressLabel={(() => { const a = toAddress(order.address); return a ? streetLine(a) || undefined : undefined; })()} />
        </section>
      )}
    </>
  );

  return (
    <div>
      <div className="border-b border-mist bg-warm/60">
        <div className="container-shop py-8 sm:py-12">
          <Link href="/conta/pedidos" className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-mid hover:text-ink transition-colors duration-150 mb-5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
            Meus pedidos
          </Link>
          <div className="flex items-center gap-3 flex-wrap pb-1">
            <h1 className="font-display font-normal text-ink text-[2.2rem] sm:text-5xl leading-[1.05] tracking-[-0.015em] tabular-nums">
              Pedido #{order.id.slice(-8).toUpperCase()}
            </h1>
            {isCancelled && (
              <span className="text-xs font-bold text-red-600 rounded-full border border-red-200 bg-red-50 px-2.5 py-1">
                Cancelado
              </span>
            )}
          </div>
          <p className="text-[13px] text-mid mt-2 flex flex-wrap gap-x-2 gap-y-1">
            {order.createdAt && <span>Feito em {formatTsDateTime(order.createdAt)}</span>}
            <span className="text-mist-d" aria-hidden="true">·</span>
            <span>{order.items.reduce((n, it) => n + it.quantity, 0)} {order.items.reduce((n, it) => n + it.quantity, 0) === 1 ? 'item' : 'itens'}</span>
            <span className="text-mist-d" aria-hidden="true">·</span>
            <span className="text-ink font-medium tabular-nums">{formatCurrency(order.totalCents)}</span>
          </p>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 [&>*]:max-w-4xl">

        {/* ── Cancelado: motivo e reembolso (antes só um selo vermelho) ── */}
        {isCancelled && (() => {
          const reason = customerCancelReason(order.timeline);
          const wasPaid = !!order.payment.paidAt;
          return (
            <div className="mb-8 rounded-3xl border border-red-200 bg-red-50/60 dark:bg-red-500/10 dark:border-red-500/30 p-5 sm:p-6">
              <p className="font-display text-[1.3rem] text-ink leading-tight">Este pedido foi cancelado</p>
              {reason && <p className="text-[13.5px] text-mid mt-1.5 leading-relaxed">{reason}</p>}
              <p className="text-[13.5px] text-ink mt-3 leading-relaxed">
                {wasPaid
                  ? `O reembolso de ${formatCurrency(order.totalCents)} será feito pelo mesmo meio de pagamento.`
                  : 'Nenhuma cobrança foi feita.'}
              </p>
              <Link href="/produtos" className="btn-primary mt-5">Ver produtos</Link>
            </div>
          );
        })()}

        {/* ── Progress bar ─────────────────────────────────────────── */}
        {!isCancelled && (
          <div className="mb-10">
            {/* Steps */}
            <ol className="flex items-start" aria-label="Andamento do pedido">
              {STATUS_STEPS.map((step, i) => (
                <li key={step.status} aria-current={i === currentStep ? 'step' : undefined} className="flex-1 flex flex-col items-center relative">
                  {/* linha conectora */}
                  {i > 0 && (
                    <div className={`absolute top-[18px] right-1/2 w-full h-[2px] ${
                      i <= currentStep ? 'bg-clay-l' : 'bg-mist'
                    }`} />
                  )}
                  {/* círculo */}
                  <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-sm border-2 transition-all ${
                    i < currentStep || (i === currentStep && order.status === 'delivered')
                      ? 'bg-clay-l border-clay-l text-paper'
                      : i === currentStep
                        ? 'bg-white dark:bg-warm border-clay-l text-clay-l shadow-sm'
                        : 'bg-white dark:bg-warm border-mist text-faint'
                  }`}>
                    {i < currentStep || (i === currentStep && order.status === 'delivered')
                      ? <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      : <StepIcon status={step.status} active={i === currentStep} />
                    }
                  </div>
                  {/* label */}
                  <span className={`mt-2 text-[11px] text-center leading-tight px-1 ${
                    i <= currentStep ? 'text-ink font-medium' : 'text-faint'
                  }`}>
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ── Rastreio em destaque, pedido já a caminho/entregue ──── */}
        {trackingIsPriority && (
          <div className="mb-8 flex flex-col gap-6">
            {trackingSection}
          </div>
        )}

        {/* ── PIX expirado: gerar outro sem refazer o pedido ───────── */}
        {order.payment.method === 'pix' && (order.status === 'payment_expired' || (order.status === 'pending_payment' && (!order.payment.pixCopyPaste || pixExpired))) && (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/50 p-6 flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-semibold text-ink">
              {order.status === 'payment_expired' || pixExpired ? 'O PIX deste pedido expirou' : 'Pague para confirmar o pedido'}
            </p>
            <p className="text-xs text-mid">
              Total: <span className="font-bold text-ink">{formatCurrency(order.totalCents)}</span>
            </p>
            <button type="button" onClick={generatePix} disabled={pixLoading} className="btn-clay text-xs px-6 py-3 font-semibold tracking-wide">
              {pixLoading ? <><span className="spinner w-3.5 h-3.5" /> Gerando…</> : 'Gerar novo PIX'}
            </button>
            {pixError && <p role="alert" className="text-xs text-red-600">{pixError}</p>}
          </div>
        )}

        {/* ── PIX pendente: mesmo bloco do modal (tempo, copiar, QR, passos) ── */}
        {/* ── Acabou de pagar (com a página aberta) ── */}
        {/* Convidado: convite para criar a conta e ver os pedidos de qualquer
            aparelho. Ao entrar, os pedidos deste aparelho vão para a conta. */}
        {isGuest && (
          <div className="mb-8 rounded-2xl border border-mist bg-warm/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <p className="text-[13.5px] text-ink leading-relaxed flex-1">
              <strong className="font-semibold">Acompanhe de qualquer lugar.</strong>{' '}
              <span className="text-mid">Crie sua conta com o mesmo e-mail e este pedido passa a aparecer nela.</span>
            </p>
            <div className="flex items-center gap-4 shrink-0">
              <Link href="/cadastro" onClick={() => setReturnTo(`/pedidos/${orderId}`)} className="btn-outline">Criar conta</Link>
              <button type="button" onClick={() => { void logout().then(() => router.push('/')); }} className="text-[12.5px] text-mid hover:text-ink underline underline-offset-4 decoration-mist-d">
                Não é você? Sair
              </button>
            </div>
          </div>
        )}

        {justPaid && (
          <div role="status" className="mb-8 rounded-3xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/[0.07] px-6 py-7 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <PaidCheck size={72} />
            <div>
              <p className="font-display text-[1.4rem] text-ink leading-tight">Pagamento confirmado!</p>
              <p className="text-sm text-mid mt-1 max-w-[42ch]">{order.payment.method === 'pix' ? 'Recebemos o seu PIX.' : 'Cartão aprovado.'} Já vamos separar o pedido e você recebe um e-mail a cada etapa.</p>
            </div>
          </div>
        )}

        {order.status === 'pending_payment' && order.payment.method === 'pix' && order.payment.pixCopyPaste && !pixExpired && (
          <div className="mb-8 rounded-3xl border border-mist bg-paper p-5 sm:p-7 max-w-md">
            <div className="flex items-baseline justify-between gap-3 mb-5">
              <p className="font-display text-[1.3rem] text-ink leading-tight">Pague com PIX</p>
              <p className="font-display text-[1.2rem] text-ink tabular-nums">{formatCurrency(order.totalCents)}</p>
            </div>
            <PixPayBlock qrCode={order.payment.pixQrCode ?? ''} copyPaste={order.payment.pixCopyPaste} expiresAt={pixExpiresIso} orderId={order.id} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-6 lg:gap-8 items-start">

          {/* ── Coluna principal ──────────────────────────────────── */}
          <div className="flex flex-col gap-6">

            {/* Itens */}
            <section>
              <h2 className="font-sans text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Itens</h2>
              <div className="flex flex-col divide-y divide-mist rounded-2xl border border-mist overflow-hidden">
                {order.items.map(item => (
                  <div key={item.note ? `${item.sku}::${item.note}` : item.sku} className="flex items-center px-5 py-4 gap-4">
                    <span className="w-12 h-[60px] shrink-0 rounded-lg overflow-hidden bg-warm">
                      {item.image && <img src={item.image} alt="" className="w-full h-full object-cover" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{item.productName}</p>
                      <p className="text-xs text-faint mt-0.5">
                        {[variantLabel({ size: item.variant.size, color: item.variant.color, colorName: item.variant.colorName }), `${item.quantity}x`].filter(Boolean).join(' · ')}
                      </p>
                      {item.note && <p className="text-xs text-clay font-medium mt-0.5">{item.note}</p>}
                    </div>
                    <span className="text-sm font-semibold text-ink shrink-0">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}
                {/* Conta fechada como no checkout: antes os itens somavam
                    R$ 379,80 e o total dizia R$ 404,80, sem o frete. */}
                {(() => {
                  const o = order as typeof order & { productsCents?: number; shippingCents?: number; pixDiscountCents?: number; couponDiscountCents?: number };
                  const products = o.productsCents ?? order.items.reduce((t, i) => t + i.unitPrice * i.quantity, 0);
                  const discount = order.discountCents ?? 0;
                  const shipping = o.shippingCents ?? Math.max(0, order.totalCents - products + discount);
                  const pix = o.pixDiscountCents ?? 0;
                  const coupon = o.couponDiscountCents ?? (discount - pix);
                  return (
                    <div className="px-5 py-3.5 flex flex-col gap-2 text-sm">
                      <div className="flex justify-between text-mid">
                        <span>Subtotal</span><span className="tabular-nums">{formatCurrency(products)}</span>
                      </div>
                      <div className="flex justify-between text-mid">
                        <span>Frete</span>
                        <span className={`tabular-nums ${shipping === 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{shipping === 0 ? 'Grátis' : formatCurrency(shipping)}</span>
                      </div>
                      {pix > 0 && (
                        <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                          <span>Desconto no PIX</span><span className="tabular-nums">− {formatCurrency(pix)}</span>
                        </div>
                      )}
                      {coupon > 0 && (
                        <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                          <span>Cupom{order.couponCode ? ` ${order.couponCode}` : ''}</span><span className="tabular-nums">− {formatCurrency(coupon)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div className="flex justify-between px-5 py-4 font-semibold text-ink">
                  <span>Total</span>
                  <span className="font-display text-xl">{formatCurrency(order.totalCents)}</span>
                </div>
              </div>
            </section>

            {/* Timeline interna do pedido */}
            {timeline.length > 0 && (
              <section>
                <h2 className="font-sans text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Histórico</h2>
                <div className="rounded-2xl border border-mist p-5">
                  <div className="relative">
                    {timeline.length > 1 && (
                      <div className="absolute left-[15px] top-4 bottom-4 w-px bg-mist" />
                    )}
                    <div className="flex flex-col gap-4">
                      {timeline.map((ev, i) => {
                        const isLatest = i === 0;
                        const tone = isLatest ? (TIMELINE_TONE[ev.status] ?? TIMELINE_TONE_MUTED) : TIMELINE_TONE_MUTED;
                        return (
                          <div key={i} className="flex items-start gap-3.5">
                            <div className={`shrink-0 rounded-full flex items-center justify-center relative z-10 ${tone} w-8 h-8 ${isLatest ? 'ring-4 ring-paper' : ''}`}>
                              <TimelineIcon status={ev.status} />
                            </div>
                            <div className="pt-1">
                              <p className={isLatest ? 'text-sm font-semibold text-ink' : 'text-sm font-medium text-mid'}>
                                {ev.title}
                              </p>
                              {ev.detail && <p className="text-xs text-faint mt-0.5">{ev.detail}</p>}
                              <p className="text-xs text-faint mt-1 tabular-nums">{formatTsDateTime(ev.at)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Rastreio, some daqui quando é prioridade (já foi promovido lá em cima) */}
            {!trackingIsPriority && trackingSection}
          </div>

          {/* ── Sidebar ───────────────────────────────────────────── */}
          <aside aria-label="Resumo do pedido" className="flex flex-col gap-4">
            {/* Ajuda com o pedido: avaliar, trocar, falar com a loja */}
            {['paid', 'preparing', 'shipped', 'delivered'].includes(order.status) && (() => {
              const shortId = order.id.slice(-8).toUpperCase();
              const deliveredAt = order.delivery?.deliveredAt ? new Date(order.delivery.deliveredAt) : null;
              const returnBy = deliveredAt ? new Date(deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
              const waHref = storeWa ? `${storeWa}${storeWa.includes('?') ? '&' : '?'}text=${encodeURIComponent(`Olá! Preciso de ajuda com o pedido #${shortId}.`)}` : null;
              const waTroca = storeWa ? `${storeWa}${storeWa.includes('?') ? '&' : '?'}text=${encodeURIComponent(`Olá! Quero solicitar troca ou devolução do pedido #${shortId}.`)}` : null;
              const row = 'group flex items-center justify-between rounded-xl px-3 py-2.5 -mx-3 text-[13.5px] text-ink hover:bg-warm transition-colors';
              const arrow = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="text-faint transition-transform duration-200 group-hover:translate-x-0.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
              return (
                <section className="rounded-2xl border border-mist p-5">
                  <h2 className="font-display font-normal text-ink text-[1.15rem] leading-tight mb-3">Ajuda com este pedido</h2>
                  <ul className="flex flex-col gap-0.5">
                    {order.status === 'delivered' && order.items[0] && (
                      <li><Link href={`/produtos/${order.items[0].productId}#avaliacoes`} className={row}>Avaliar produtos{arrow}</Link></li>
                    )}
                    {order.status === 'delivered' && (
                      <li>
                        {waTroca
                          ? <a href={waTroca} target="_blank" rel="noopener noreferrer" className={row}>Solicitar troca ou devolução{arrow}</a>
                          : <Link href="/trocas-e-devolucoes" className={row}>Solicitar troca ou devolução{arrow}</Link>}
                      </li>
                    )}
                    {waHref && (
                      <li><a href={waHref} target="_blank" rel="noopener noreferrer" className={row}>Falar com a loja no WhatsApp{arrow}</a></li>
                    )}
                    <li><Link href="/trocas-e-devolucoes" className={row}>Política de trocas{arrow}</Link></li>
                  </ul>
                  {returnBy && returnBy.getTime() > Date.now() && (
                    <p className="text-[12px] text-mid mt-3 leading-relaxed">
                      Você pode desistir da compra sem custo até {returnBy.toLocaleDateString('pt-BR')}.
                    </p>
                  )}
                </section>
              );
            })()}

            {/* Entrega */}
            {carrier && carrier !== 'pickup' && (
              <section className="rounded-2xl border border-mist p-5">
                <h2 className="font-sans text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Entrega</h2>
                <p className="text-sm font-medium text-ink">{carrierName(carrier)}</p>
                {order.delivery?.dispatchedAt && (
                  <p className="text-xs text-faint mt-1">
                    Despachado em {formatTs(order.delivery.dispatchedAt)}
                  </p>
                )}
                {trackCode && !trackingOnTop && (
                  <div className="mt-3 pt-3 border-t border-mist">
                    <p className="text-xs text-faint mb-1">Código de rastreio</p>
                    <p className="font-mono text-sm font-bold text-ink">{trackCode}</p>
                    {rastreioUrl && (
                      <a
                        href={rastreioUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-clay hover:text-clay-d min-h-10 transition-colors"                      >
                        Rastrear
                        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                      </a>
                    )}
                  </div>
                )}
                {order.status === 'shipped' && !trackingOnTop && (
                  <div className="mt-3 pt-3 border-t border-mist">
                    <button
                      onClick={confirmReceived}
                      disabled={confirmingReceived}
                      className="w-full rounded-full bg-ink text-paper text-[13px] font-bold py-2.5 hover:bg-ink/80 disabled:opacity-50 transition-colors"
                    >
                      {confirmingReceived ? 'Confirmando…' : 'Já recebi meu pedido'}
                    </button>
                    <p className="text-[11px] text-faint mt-2 leading-relaxed">
                      Confirme aqui se o pedido já chegou, mesmo antes da transportadora atualizar o status sozinha.
                    </p>
                    {confirmReceivedError && (
                      <p className="text-[12px] text-red-600 mt-2">{confirmReceivedError}</p>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Retirada: onde e quando buscar (antes mostrava o endereço do
                próprio cliente, que não serve para nada aqui). */}
            {carrier === 'pickup' && (
              <section className="rounded-2xl border border-mist p-5">
                <h2 className="font-sans text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Onde retirar</h2>
                {store?.address ? (
                  <>
                    <address className="text-sm text-ink not-italic leading-relaxed">
                      {store.address}<br />
                      <span className="text-mid">{store.city}</span>
                    </address>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.address}, ${store.city}`)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center min-h-10 text-xs font-medium text-clay hover:text-clay-d transition-colors"
                    >
                      Abrir no mapa →
                    </a>
                  </>
                ) : (
                  <p className="text-sm text-ink">Retirada na loja</p>
                )}
                {store && store.hours.length > 0 && (
                  <dl className="mt-3 pt-3 border-t border-mist text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {store.hours.map(h => (
                      <div key={h.label} className="contents">
                        <dt className="text-faint">{h.label}</dt>
                        <dd className="text-mid text-right">{h.text}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            )}

            {/* Endereço */}
            {carrier !== 'pickup' && (
            <section className="rounded-2xl border border-mist p-5">
              <h2 className="font-sans text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Endereço</h2>
              <address className="text-sm text-mid not-italic leading-relaxed">
                {order.address.street}, {order.address.number}
                {order.address.complement && ` · ${order.address.complement}`}<br />
                {order.address.neighborhood}, {order.address.city} · {order.address.state}<br />
                CEP {order.address.cep.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2')}
              </address>
            </section>
            )}

            {/* Pagamento */}
            <section className="rounded-2xl border border-mist p-5">
              <h2 className="font-sans text-xs font-bold tracking-[0.15em] uppercase text-faint mb-3">Pagamento</h2>
              <p className="text-sm text-ink">{order.payment.method === 'pix' ? 'PIX' : `Cartão de crédito${order.payment.cardLastFour ? ` final ${order.payment.cardLastFour}` : ''}${order.payment.installments > 1 ? ` · ${order.payment.installments}x` : ' · à vista'}`}</p>
              {order.payment.paidAt && (
                <p className="text-xs text-faint mt-1">
                  Confirmado em {formatTsDateTime(order.payment.paidAt)}
                </p>
              )}
            </section>

          </aside>

        </div>
      </div>

      {newPix && (
        <PIXModal
          qrCode={newPix.qrCode}
          copyPaste={newPix.copyPaste}
          orderId={order.id}
          totalCents={newPix.totalCents ?? order.totalCents}
          expiresAt={newPix.expiresAt}
          onClose={() => setNewPix(null)}
        />
      )}
    </div>
  );
}

function CopyCode({ code }: { code: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  function flash(s: 'copied' | 'failed') { setState(s); setTimeout(() => setState('idle'), 1800); }
  return (
    <>
      <button
        type="button"
        aria-label={`Copiar código de rastreio ${code}`}
        onClick={() => {
          // Sem área de transferência (navegador antigo, http): avisa em vez
          // de não fazer nada; o código está visível para copiar à mão.
          if (!navigator.clipboard) { flash('failed'); return; }
          navigator.clipboard.writeText(code).then(() => flash('copied'), () => flash('failed'));
        }}
        className="inline-flex items-center h-9 px-3.5 rounded-full border border-mist-d text-[12.5px] font-medium text-ink hover:border-ink transition-colors"
      >
        {state === 'copied' ? 'Copiado' : 'Copiar'}
      </button>
      <span role="status" className="sr-only">
        {state === 'copied' ? 'Código copiado' : state === 'failed' ? 'Não deu para copiar. Selecione o código e copie.' : ''}
      </span>
    </>
  );
}
