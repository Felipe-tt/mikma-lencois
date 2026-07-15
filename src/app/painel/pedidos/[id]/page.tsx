'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, onSnapshot, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Order, User } from '@/types';
import dynamic from 'next/dynamic';
import { TrackingTimeline } from '@/components/tracking/TrackingTimeline';

// Carregado sob demanda: leaflet só é baixado quando essa página realmente
// precisa mostrar o mapa, em vez de entrar no bundle inicial da rota.
const LiveDeliveryMap = dynamic(
  () => import('@/components/tracking/LiveDeliveryMap').then(m => m.LiveDeliveryMap),
  { ssr: false }
);
import { carrierNameVendor, trackingUrl } from '@/lib/carriers';
import { formatCurrency } from '@/lib/utils/format';
import {
  IconTruck, IconProducts, IconBox, IconMaintenance, IconUser, IconCard, IconPin, IconClock,
  IconHourglass, IconCheck, IconMoney, IconTrophy, IconAlert, IconX, IconPrint, IconExchange,
} from '@/components/ui/Icon';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { RegisterReturnModal } from '@/components/painel/RegisterReturnModal';

const STATUS_LABELS: Record<Order['status'], string> = {
  pending_payment: 'Aguardando Pagamento',
  paid: 'Pago',
  preparing: 'Separando',
  shipped: 'A caminho',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};
const STATUS_BADGE: Record<Order['status'], string> = {
  pending_payment: 'badge-pending', paid: 'badge-paid', preparing: 'badge-preparing',
  shipped: 'badge-shipped', delivered: 'badge-delivered', cancelled: 'badge-cancelled',
};
const STATUS_NEXT: Partial<Record<Order['status'], Order['status']>> = {
  paid: 'preparing', preparing: 'shipped', shipped: 'delivered',
};
const TIMELINE_LABEL: Record<string, string> = {
  created: 'Pedido criado',
  payment_initiated: 'Pagamento iniciado',
  payment_confirmed: 'Pagamento confirmado',
  payment_expired: 'PIX expirou sem pagamento',
  payment_failed: 'Pagamento recusado',
  pending_payment: 'Aguardando pagamento',
  paid: 'Pagamento recebido',
  preparing: 'Começou a separar o pedido',
  shipped: 'Pedido despachado',
  delivery_cancelled: 'Entrega cancelada — remetente corrigiu',
  delivered: 'Pedido entregue ao cliente',
  cancelled: 'Pedido cancelado',
};

const TIMELINE_ICON_COMP: Record<string, React.FC<{ size?: number; className?: string }>> = {
  created: IconProducts,
  payment_initiated: IconHourglass,
  payment_confirmed: IconCheck,
  payment_expired: IconClock,
  payment_failed: IconX,
  pending_payment: IconHourglass,
  paid: IconMoney,
  preparing: IconBox,
  shipped: IconTruck,
  delivery_cancelled: IconAlert,
  delivered: IconTrophy,
  cancelled: IconX,
};

const TIMELINE_COLOR: Record<string, string> = {
  created: 'bg-mist', payment_initiated: 'bg-blue-300', payment_confirmed: 'bg-emerald-400',
  payment_expired: 'bg-orange-400', payment_failed: 'bg-red-400', pending_payment: 'bg-yellow-300',
  paid: 'bg-emerald-400', preparing: 'bg-blue-400', shipped: 'bg-purple-400',
  delivery_cancelled: 'bg-orange-300',
  delivered: 'bg-emerald-500', cancelled: 'bg-red-400',
};

function timelineLabel(status: string, order: Order): string {
  if (status === 'payment_initiated') {
    return order.payment.method === 'card'
      ? 'Checkout de cartão iniciado'
      : 'PIX gerado — cliente viu o QR code';
  }
  return TIMELINE_LABEL[status] ?? status;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDateTime(value: unknown): string {
  const d = toDate(value);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(d);
  } catch { return String(value); }
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-warm last:border-0">
      <span className="text-[12px] text-faint shrink-0">{label}</span>
      <span className={`text-[13px] text-ink text-right ${mono ? 'font-mono text-[11px] break-all' : 'font-medium'}`}>{value}</span>
    </div>
  );
}

const CARD_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  user: IconUser, card: IconCard, pin: IconPin, truck: IconTruck, clock: IconClock,
};

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const IconComp = CARD_ICONS[icon];
  return (
    <div className="bg-paper border border-mist">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-mist bg-warm">
        {IconComp && <IconComp size={13} className="text-mid" />}
        <p className="text-[12px] font-bold text-ink tracking-wide uppercase">{title}</p>
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  );
}

export default function PainelPedidoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [trackingCode, setTrackingCode] = useState('');
  const [copied, setCopied]       = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [cancellingDelivery, setCancellingDelivery] = useState(false);
  const [cancelDeliveryError, setCancelDeliveryError] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [cancelOrderError, setCancelOrderError] = useState<string | null>(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnRegistered, setReturnRegistered] = useState(false);

  useEffect(() => {
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      router.push('/entrar'); return;
    }
    return onSnapshot(doc(db, 'orders', id), async snap => {
      if (snap.exists()) {
        const raw = snap.data();

        // Converte qualquer Firestore Timestamp para ISO string
        function normalizeDate(v: unknown): string | undefined {
          if (!v) return undefined;
          if (typeof v === 'object' && v !== null && 'seconds' in v)
            return new Date((v as { seconds: number }).seconds * 1000).toISOString();
          if (typeof v === 'string') return v;
          return undefined;
        }

        const o: Order = {
          id: snap.id,
          ...raw,
          createdAt: normalizeDate(raw.createdAt) ?? '',
          updatedAt: normalizeDate(raw.updatedAt),
          payment: raw.payment ? {
            ...raw.payment,
            paidAt: normalizeDate(raw.payment.paidAt),
          } : raw.payment,
          delivery: raw.delivery ? {
            ...raw.delivery,
            dispatchedAt: normalizeDate(raw.delivery.dispatchedAt),
            estimatedDelivery: normalizeDate(raw.delivery.estimatedDelivery),
          } : raw.delivery,
          timeline: (raw.timeline ?? []).map((ev: Record<string, unknown>) => ({
            ...ev,
            at: normalizeDate(ev.at) ?? '',
          })),
        } as Order;

        setOrder(o);
        if (o.userId) {
          try {
            const uSnap = await getDoc(doc(db, 'users', o.userId));
            if (uSnap.exists()) {
              const ur = uSnap.data();
              setCustomer({
                uid: uSnap.id,
                ...ur,
                createdAt: normalizeDate(ur.createdAt) ?? '',
                updatedAt: normalizeDate(ur.updatedAt),
              } as User);
            }
          } catch (err) {
            // Não deixa uma falha ao buscar dados do cliente travar a tela
            // inteira — o pedido em si já carregou e pode ser exibido.
            console.error('Erro ao buscar dados do cliente:', err);
          }
        }
      }
      setLoading(false);
    });
  }, [id, user, router]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function advanceStatus() {
    if (!order) return;
    const next = STATUS_NEXT[order.status];
    if (!next) return;
    setUpdating(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/orders/${id}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(trackingCode ? { trackingCode } : {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        await confirmDialog({
          message: err.error ?? 'Erro ao atualizar status',
          alertOnly: true,
        });
      }
    } finally { setUpdating(false); }
  }

  async function dispatchDelivery() {
    if (!order) return;
    setUpdating(true);
    setDispatchError(null);
    try {
      const token = await user!.getIdToken();
      const carrier = (order as unknown as { selectedShipping?: { carrier?: string } }).selectedShipping?.carrier ?? 'correios_pac';
      const res = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, carrier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDispatchError(data.error || 'Não foi possível despachar este pedido. Tente novamente.');
        return;
      }
      if (data.trackingCode) setTrackingCode(data.trackingCode);
    } catch {
      setDispatchError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setUpdating(false);
    }
  }

  async function cancelDelivery() {
    if (!order) return;
    const { confirmed: hasReason, value: reason } = await confirmDialog({
      message: 'Motivo do cancelamento',
      detail: 'Obrigatório — aparece no registro do pedido.',
      withInput: true,
      inputPlaceholder: 'Ex: etiqueta gerada com endereço errado',
      confirmLabel: 'Continuar',
    });
    if (!hasReason) return;
    if (!reason?.trim()) {
      await confirmDialog({ message: 'Informe um motivo para cancelar.', alertOnly: true });
      return;
    }
    const carrier = order.delivery?.carrier ?? 'transportadora';
    const { confirmed } = await confirmDialog({
      message: `Cancelar a entrega despachada via ${carrier}?`,
      detail: 'A etiqueta será cancelada no Melhor Envio e o pedido voltará para "Em preparo".',
      confirmLabel: 'Cancelar entrega',
      variant: 'danger',
    });
    if (!confirmed) return;

    setCancellingDelivery(true);
    setCancelDeliveryError(null);
    try {
      const token = await user!.getIdToken();
      const res = await fetch('/api/delivery', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, reason: (reason ?? '').trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCancelDeliveryError(data.error || 'Não foi possível cancelar a entrega.');
        return;
      }
      setTrackingCode('');
    } catch {
      setCancelDeliveryError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setCancellingDelivery(false);
    }
  }

  async function handleCancelOrder() {
    if (!order || order.status === 'cancelled' || order.status === 'delivered') return;
    const willReturnStock = order.status !== 'pending_payment';
    const { confirmed, value: reason } = await confirmDialog({
      message: 'Cancelar este pedido?',
      detail: `${willReturnStock ? 'O estoque será devolvido. ' : ''}Esta ação não tem como desfazer.`,
      withInput: true,
      inputPlaceholder: 'Motivo do cancelamento (opcional)',
      confirmLabel: 'Cancelar pedido',
      variant: 'danger',
    });
    if (!confirmed) return;
    setCancellingOrder(true);
    setCancelOrderError(null);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/orders/${order.id}/admin-cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: (reason ?? '').trim() || 'Cancelado pelo lojista' }),
      });
      const data = await res.json();
      if (!res.ok) { setCancelOrderError(data.error ?? 'Erro ao cancelar pedido'); return; }
      setOrder(prev => prev ? { ...prev, status: 'cancelled' } : prev);
    } catch {
      setCancelOrderError('Erro de conexão. Tente novamente.');
    } finally {
      setCancellingOrder(false);
    }
  }

  async function handleDelete() {
    if (!order || order.status !== 'cancelled') return;
    const { confirmed } = await confirmDialog({
      message: 'Apagar permanentemente este pedido?',
      detail: 'Esta ação não tem como desfazer.',
      confirmLabel: 'Apagar pedido',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeleting(true);
    try { await deleteDoc(doc(db, 'orders', id)); router.push('/painel/pedidos'); }
    catch { setDeleting(false); }
  }

  if (loading) return (
    <div className="max-w-2xl flex flex-col gap-3">
      {[1,2,3,4].map(i => <div key={i} className="h-20 skeleton border border-mist" />)}
    </div>
  );

  if (!order) return <p className="text-sm text-faint py-8 text-center">Pedido não encontrado.</p>;

  const timeline = [...(order.timeline ?? [])].reverse();
  const subtotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-faint hover:text-ink transition-colors p-1 -ml-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="font-display font-normal text-ink text-xl">Pedido #{order.id.slice(-8).toUpperCase()}</h1>
          <p className="text-[11px] text-faint">Criado em {formatDateTime(order.createdAt)}</p>
        </div>
        <span className={STATUS_BADGE[order.status] ?? 'badge'}>
          {STATUS_LABELS[order.status]}
        </span>
      </div>

      <div className="flex flex-col gap-4">

        {/* ── Alerta de ação necessária ── */}
        {order.status === 'paid' && (
          <div className="border-2 border-clay-l bg-clay-l/5 px-5 py-4">
            <p className="text-[14px] font-bold text-ink mb-1">Este pedido foi pago e está esperando você!</p>
            <p className="text-[12px] text-mid mb-3">Comece a separar os itens e clique no botão abaixo quando terminar.</p>
            <button onClick={advanceStatus} disabled={updating}
              className="w-full bg-clay-l text-paper text-[13px] font-bold py-3 hover:bg-clay-d disabled:opacity-50 transition-colors">
              {updating ? 'Salvando…' : 'Comecei a separar o pedido'}
            </button>
          </div>
        )}

        {order.status === 'preparing' && (() => {
          const shipping = (order as unknown as { selectedShipping?: { carrier?: string; label?: string; priceCents?: number; estimatedDays?: number } }).selectedShipping;
          const carrier = shipping?.carrier ?? 'correios_pac';
          const isPickup    = carrier === 'pickup';
          const isUberDirect = carrier === 'uber_direct';
          const CARRIER_LABELS: Record<string, string> = {
            correios_pac:    'Correios PAC',
            correios_sedex:  'Correios SEDEX',
            jadlog_package:  'Jadlog Package',
            jadlog_expresso: 'Jadlog Expresso',
            pickup:          'Retirada na loja',
            uber_direct:     'Uber Direct',
          };
          return (
            <div className="border border-ink/20 bg-ink/5 px-5 py-4 flex flex-col gap-3">
              <p className="text-[13px] font-bold text-ink">Pedido sendo separado</p>

              {/* Forma de envio escolhida pelo cliente — não editável */}
              <div className="flex items-center justify-between bg-white dark:bg-warm border border-mist px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint mb-0.5">
                    Envio escolhido pelo cliente
                  </p>
                  <p className="text-[13px] font-semibold text-ink">
                    {CARRIER_LABELS[carrier] ?? shipping?.label ?? carrier}
                  </p>
                  {shipping?.estimatedDays !== undefined && !isPickup && (
                    <p className="text-[11px] text-faint mt-0.5">
                      Prazo: {shipping.estimatedDays === 0 ? 'hoje' : `${shipping.estimatedDays} dias úteis`}
                    </p>
                  )}
                </div>
                {shipping?.priceCents !== undefined && (
                  <span className="text-[14px] font-bold text-ink">
                    {shipping.priceCents === 0 ? 'Grátis' : `R$ ${(shipping.priceCents / 100).toFixed(2).replace('.', ',')}`}
                  </span>
                )}
              </div>

              {isPickup ? (
                <p className="text-[12px] text-mid">
                  O cliente vai retirar na loja. Quando ele buscar o pedido, clique em &quot;Confirmar retirada&quot;.
                </p>
              ) : isUberDirect ? (
                <p className="text-[11px] text-faint">
                  Um motoboy Uber será solicitado assim que você clicar. Acompanhe o status em tempo real aqui no painel.
                </p>
              ) : (
                <p className="text-[11px] text-faint">
                  A etiqueta será gerada automaticamente via Melhor Envio e o saldo da sua conta será debitado.
                  Imprima, cole na caixa e poste.
                </p>
              )}

              {dispatchError && (
                <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2">{dispatchError}</p>
              )}

              <button
                onClick={dispatchDelivery}
                disabled={updating}
                className="w-full bg-ink text-paper text-[13px] font-bold py-3 hover:bg-ink/80 disabled:opacity-50 transition-colors"
              >
                {updating
                  ? (isPickup ? 'Salvando…' : isUberDirect ? 'Solicitando motoboy…' : 'Gerando etiqueta…')
                  : (isPickup ? 'Confirmar retirada' : isUberDirect ? 'Solicitar motoboy Uber' : 'Gerar etiqueta e despachar')}
              </button>
            </div>
          );
        })()}

        {order.status === 'shipped' && (
          <div className="border border-mist px-5 py-4 flex flex-col gap-3">
            <p className="text-[13px] font-bold text-ink flex items-center gap-1.5"><IconTruck size={13} className="text-clay-l" /> Pedido despachado</p>

            {/* ── Uber Direct: entregador em tempo real ─────────────────── */}
            {order.delivery?.carrier === 'uber_direct' && (
              <div className="bg-[#F5F1EB] border border-mist px-4 py-3 flex flex-col gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Uber Direct</p>

                {/* Entregador */}
                {order.delivery.courierName ? (
                  <div className="flex items-center gap-3">
                    {order.delivery.courierPhoto ? (
                      <img src={order.delivery.courierPhoto} alt={order.delivery.courierName}
                        className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-9 h-9 rounded-full bg-mist flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="1.8" strokeLinecap="round" className="w-4 h-4"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                      </span>
                    )}
                    <div>
                      <p className="text-[13px] font-semibold text-ink">{order.delivery.courierName}</p>
                      {order.delivery.courierPhone && (
                        <p className="text-[11px] text-mid font-mono">{order.delivery.courierPhone}</p>
                      )}
                      {order.delivery.courierVehicle && (
                        <p className="text-[11px] text-faint capitalize">{order.delivery.courierVehicle}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-faint">Procurando entregador…</p>
                )}

                {/* ETAs */}
                {(order.delivery.pickupEta || order.delivery.dropoffEta) && (
                  <div className="flex gap-4">
                    {order.delivery.pickupEta && (
                      <p className="text-[12px] text-mid">
                        Previsão de coleta:{' '}
                        <span className="font-bold text-ink">
                          {new Date(order.delivery.pickupEta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>
                    )}
                    {order.delivery.dropoffEta && (
                      <p className="text-[12px] text-mid">
                        Previsão de chegada:{' '}
                        <span className="font-bold text-ink">
                          {new Date(order.delivery.dropoffEta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {/* Mapa ao vivo */}
                <LiveDeliveryMap
                  routePoints={order.delivery.routePoints}
                  courierLat={order.delivery.courierLat}
                  courierLng={order.delivery.courierLng}
                  courierLocationAt={order.delivery.courierLocationAt}
                  courierName={order.delivery.courierName}
                />

                {/* Link rastreio em tempo real */}
                {order.delivery.trackingUrl && (
                  <a href={order.delivery.trackingUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full py-2 bg-ink text-paper text-[12px] font-bold hover:bg-ink/80 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                    Abrir rastreio da Uber em outra aba
                  </a>
                )}
              </div>
            )}

            {/* Código de rastreio (Melhor Envio / Correios) */}
            {order.delivery?.trackingCode && (
              <div className="flex items-center justify-between bg-warm px-3 py-2.5">
                <div>
                  <p className="text-[10px] text-faint mb-0.5">Código de rastreio</p>
                  <p className="text-[13px] font-mono font-bold text-ink">{order.delivery.trackingCode}</p>
                </div>
                <button onClick={() => copy(order.delivery!.trackingCode!, 'tracking')}
                  className="text-[11px] font-semibold text-clay-l hover:text-clay-d transition-colors">
                  {copied === 'tracking' ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            )}
            {order.delivery?.trackingUrl && order.delivery?.carrier !== 'uber_direct' && (
              <a href={order.delivery.trackingUrl} target="_blank" rel="noopener noreferrer"
                className="text-[12px] text-clay-l font-semibold hover:underline">
                Rastrear envio
              </a>
            )}
            {order.delivery?.labelUrl && (
              <a href={order.delivery.labelUrl} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 border border-mist text-mid text-[12px] font-semibold py-2.5 hover:bg-warm transition-colors">
                Reimprimir etiqueta
              </a>
            )}
            <button onClick={advanceStatus} disabled={updating}
              className="w-full bg-ink text-paper text-[13px] font-bold py-3 hover:bg-ink/80 disabled:opacity-50 transition-colors">
              {updating ? 'Salvando…' : 'Confirmar entrega ao cliente'}
            </button>

            {cancelDeliveryError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2">{cancelDeliveryError}</p>
            )}
            <button onClick={cancelDelivery} disabled={cancellingDelivery}
              className="w-full text-[12px] font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors py-1">
              {cancellingDelivery ? 'Cancelando…' : 'Cancelar entrega'}
            </button>
          </div>
        )}

        {/* ── Cliente ── */}
        <Card title="Cliente" icon="user">
          {customer ? (
            <>
              <Row label="Nome" value={customer.name} />
              <Row label="E-mail" value={customer.email} />
              <Row label="CPF" value={customer.cpf ? customer.cpf : 'Não informado'} />
              <Row label="Cliente desde" value={formatDateTime(customer.createdAt)} />
              {customer.address && (
                <Row label="Endereço cadastrado" value={`${customer.address.street}, ${customer.address.number} — ${customer.address.city}/${customer.address.state}`} />
              )}
            </>
          ) : (
            <Row label="ID do cliente" value={order.userId} mono />
          )}
        </Card>

        {/* ── Itens ── */}
        <div className="bg-paper border border-mist">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-mist bg-warm">
            <IconProducts size={14} className="text-mid shrink-0" />
            <p className="text-[12px] font-bold text-ink tracking-wide uppercase">Itens do pedido</p>
          </div>
          <div className="divide-y divide-mist">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                {item.image && (
                  <div className="w-10 h-[52px] shrink-0 overflow-hidden bg-warm border border-mist">
                    <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-ink leading-snug">{item.productName}</p>
                  <p className="text-[11px] text-faint mt-0.5">
                    {item.variant.size}{item.variant.color ? ` · ${item.variant.color}` : ''}{item.variant.fabric ? ` · ${item.variant.fabric}` : ''}{' '}
                    · {item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'} · {formatCurrency(item.unitPrice)} cada
                  </p>
                  <p className="text-[10px] font-mono text-faint/60 mt-0.5">SKU: {item.sku}</p>
                </div>
                <span className="text-[13px] font-semibold text-ink shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-mist flex flex-col gap-1.5">
            <div className="flex justify-between text-[12px] text-faint">
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            {order.discountCents ? (
              <div className="flex justify-between text-[12px] text-emerald-600">
                <span>Desconto {order.couponCode ? `(cupom ${order.couponCode})` : ''}</span>
                <span>- {formatCurrency(order.discountCents)}</span>
              </div>
            ) : null}
            <div className="flex justify-between pt-2 border-t border-mist">
              <span className="text-[13px] font-bold text-ink">Total pago</span>
              <span className="font-display text-xl text-ink">{formatCurrency(order.totalCents)}</span>
            </div>
          </div>
        </div>

        {/* ── Pagamento ── */}
        <Card title="Pagamento" icon="card">
          <Row label="Método" value={order.payment.method.toUpperCase()} />
          <Row label="Status" value={STATUS_LABELS[order.status]} />
          <Row label="Pago em" value={order.payment.paidAt ? formatDateTime(order.payment.paidAt) : null} />
          {order.payment.method === 'pix' && (
            <Row label="ID da transação" value={order.payment.txId} mono />
          )}
          {order.payment.method === 'card' && (
            <Row label="Parcelas" value={`${order.payment.installments}x`} />
          )}
          {order.payment.method === 'pix' && order.payment.pixCopyPaste && (
            <div className="py-2.5 border-b border-warm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-faint">PIX Copia e Cola</span>
                <button onClick={() => copy(order.payment.method === 'pix' ? order.payment.pixCopyPaste! : '', 'pix')}
                  className="text-[11px] font-semibold text-clay-l hover:text-clay-d transition-colors">
                  {copied === 'pix' ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="text-[10px] font-mono text-faint break-all bg-warm px-2 py-1.5 leading-relaxed">
                {order.payment.pixCopyPaste.slice(0, 80)}…
              </p>
            </div>
          )}
        </Card>

        {/* ── Endereço de entrega ── */}
        <Card title="Endereço de entrega" icon="pin">
          <Row label="Rua" value={`${order.address.street}, ${order.address.number}${order.address.complement ? ` — ${order.address.complement}` : ''}`} />
          <Row label="Bairro" value={order.address.neighborhood} />
          <Row label="Cidade" value={`${order.address.city} — ${order.address.state}`} />
          <Row label="CEP" value={order.address.cep} />
          <div className="py-2.5 flex flex-col gap-2">
            <button
              onClick={() => copy(`${order.address.street}, ${order.address.number}${order.address.complement ? `, ${order.address.complement}` : ''}, ${order.address.neighborhood}, ${order.address.city} - ${order.address.state}, CEP ${order.address.cep}`, 'address')}
              className="w-full border border-mist text-mid text-[12px] font-semibold py-2 hover:bg-warm transition-colors">
              {copied === 'address' ? 'Endereço copiado!' : 'Copiar endereço completo'}
            </button>
            <Link
              href={`/painel/pedidos/${order.id}/etiqueta`}
              className="flex items-center justify-center gap-1.5 w-full bg-ink text-paper text-[12px] font-semibold py-2 hover:bg-ink/80 transition-colors">
              <IconPrint size={13} /> Imprimir nota de separação (uso interno)
            </Link>
          </div>
        </Card>

        {/* ── Entrega / Rastreio ── */}
        {order.delivery && (
          <Card title="Entrega" icon="truck">
            <Row label="Transportadora" value={order.delivery.carrier ? carrierNameVendor(order.delivery.carrier) : 'Não definida'} />
            <Row label="Despachado em" value={order.delivery.dispatchedAt ? formatDateTime(order.delivery.dispatchedAt) : null} />
            <Row label="Previsão" value={order.delivery.estimatedDelivery ? formatDateTime(order.delivery.estimatedDelivery) : null} />
            {order.delivery.trackingCode && (
              <div className="py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-faint">Código de rastreio</span>
                  <button onClick={() => copy(order.delivery!.trackingCode!, 'tracking')}
                    className="text-[11px] font-semibold text-clay-l hover:text-clay-d transition-colors">
                    {copied === 'tracking' ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
                <p className="font-mono text-[13px] text-ink font-bold mb-2">{order.delivery.trackingCode}</p>
                {(() => {
                  const url = order.delivery.carrier
                    ? trackingUrl(order.delivery.carrier, order.delivery.trackingCode)
                    : null;
                  return url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="text-[12px] font-semibold text-clay-l hover:text-clay-d transition-colors">
                      Rastrear na transportadora
                    </a>
                  ) : null;
                })()}
              </div>
            )}
          </Card>
        )}

        {/* ── Rastreamento (Correios/Melhor Envio — Uber Direct já tem o card
             próprio "entregador em tempo real" acima, com ETA e link do
             mapa; esse aqui não tem noção de Uber Direct e só mostraria um
             erro confuso de "Melhor Envio" pra esses pedidos) ── */}
        {order.delivery?.carrier && order.delivery.carrier !== 'pickup' && order.delivery.carrier !== 'manual' && order.delivery.carrier !== 'uber_direct' && (
          <div className="bg-paper border border-mist">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-mist bg-warm">
              <IconBox size={16} className="text-mid shrink-0" />
              <p className="text-[12px] font-bold text-ink tracking-wide uppercase">Rastreamento</p>
              <span className="ml-auto font-mono text-[11px] text-mid">{order.delivery.trackingCode}</span>
            </div>
            <div className="px-5 py-4">
              <TrackingTimeline orderId={order.id} carrierName={carrierNameVendor(order.delivery.carrier!)} />
            </div>
          </div>
        )}

        {/* ── Histórico do pedido ── */}
        <Card title="Histórico do pedido" icon="clock">
          <div className="py-3">
            {timeline.length === 0 ? (
              <p className="text-[12px] text-faint text-center py-3">Sem histórico registrado.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {timeline.map((ev, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`w-2.5 h-2.5 shrink-0 mt-1.5 ${TIMELINE_COLOR[ev.status] ?? 'bg-mist'}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {(() => { const TLIcon = TIMELINE_ICON_COMP[ev.status]; return TLIcon ? <TLIcon size={13} /> : <span>•</span>; })()}
                        <p className="text-[13px] font-semibold text-ink">{timelineLabel(ev.status, order)}</p>
                      </div>
                      {ev.note && <p className="text-[12px] text-mid mt-0.5 ml-7">{ev.note}</p>}
                      <p className="text-[11px] text-faint mt-0.5 ml-7 tabular-nums">{formatDateTime(ev.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ── Info técnica ── */}
        <details className="bg-paper border border-mist">
          <summary className="flex items-center gap-2 px-5 py-3.5 cursor-pointer select-none bg-warm border-b border-mist">
            <IconMaintenance size={14} className="text-mid shrink-0" />
            <p className="text-[12px] font-bold text-ink tracking-wide uppercase">Informações técnicas</p>
          </summary>
          <div className="px-5 py-1">
            <Row label="ID do pedido" value={order.id} mono />
            <Row label="ID do cliente" value={order.userId} mono />
            <Row label="Criado em" value={formatDateTime(order.createdAt)} />
            <Row label="Última atualização" value={order.updatedAt ? formatDateTime(order.updatedAt) : null} />
          </div>
        </details>

        {/* ── Troca / devolução ── */}
        {order.status !== 'pending_payment' && order.status !== 'cancelled' && (
          <div className="flex flex-col gap-2">
            {returnRegistered && (
              <p className="text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2">
                Registrado. Acompanhe em <a href="/painel/trocas" className="underline font-semibold">Trocas</a>.
              </p>
            )}
            <button onClick={() => setReturnModalOpen(true)}
              className="flex items-center justify-center gap-1.5 w-full border border-mist text-mid text-[13px] font-semibold py-3 hover:bg-warm transition-colors">
              <IconExchange size={14} /> Registrar troca ou devolução
            </button>
          </div>
        )}

        {/* ── Cancelar pedido (lojista) ── */}
        {order.status !== 'cancelled' && order.status !== 'delivered' && (
          <div className="flex flex-col gap-2">
            {cancelOrderError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2">{cancelOrderError}</p>
            )}
            <button onClick={handleCancelOrder} disabled={cancellingOrder}
              className="w-full border border-red-200 bg-red-50 text-red-700 text-[13px] font-semibold py-3 hover:bg-red-100 disabled:opacity-50 transition-colors">
              {cancellingOrder ? 'Cancelando…' : 'Cancelar este pedido'}
            </button>
          </div>
        )}

        {/* ── Apagar se cancelado ── */}
        {order.status === 'cancelled' && (
          <button onClick={handleDelete} disabled={deleting}
            className="w-full border border-red-200 bg-red-50 text-red-700 text-[13px] font-semibold py-3 hover:bg-red-100 disabled:opacity-50 transition-colors">
            {deleting ? 'Apagando…' : 'Apagar este pedido cancelado'}
          </button>
        )}
      </div>

      {returnModalOpen && (
        <RegisterReturnModal
          order={order}
          customerName={customer?.name}
          onClose={() => setReturnModalOpen(false)}
          onDone={() => { setReturnModalOpen(false); setReturnRegistered(true); }}
        />
      )}
    </div>
  );
}
