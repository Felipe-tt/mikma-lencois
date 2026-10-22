'use client';

import { plural } from '@/lib/plural';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, onSnapshot, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { maskCep, maskPhone } from '@/lib/masks';
import type { Order, User } from '@/types';
import dynamic from 'next/dynamic';
import { TrackingTimeline } from '@/components/tracking/TrackingTimeline';
import { useUberSync } from '@/components/tracking/useUberSync';
import { UberTracking } from '@/components/tracking/UberTracking';
import { toAddress, streetLine } from '@/lib/address';

import { carrierNameVendor, trackingUrl, isCorreios, isManualDispatch, isValidTrackingCodeFor } from '@/lib/carriers';
import { formatCurrency } from '@/lib/utils/format';
import {
  IconTruck, IconProducts, IconBox, IconMaintenance, IconUser, IconCard, IconPin, IconClock,
  IconHourglass, IconCheck, IconMoney, IconTrophy, IconAlert, IconX, IconPrint, IconExchange,
} from '@/components/ui/Icon';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { RegisterReturnModal } from '@/components/painel/RegisterReturnModal';

const STATUS_LABELS: Record<Order['status'], string> = {
  pending_payment: 'Aguardando Pagamento',
  payment_expired: 'PIX expirado',
  paid: 'Pago',
  preparing: 'Separando',
  shipped: 'A caminho',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};
const STATUS_BADGE: Record<Order['status'], string> = {
  pending_payment: 'badge-pending', payment_expired: 'badge-pending', paid: 'badge-paid', preparing: 'badge-preparing',
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
  delivery_cancelled: 'Entrega cancelada, remetente corrigiu',
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

// Mesma paleta dos badges de status do pedido (.badge-paid, .badge-shipped
// etc. em globals.css) — fundo pastel + texto colorido, não círculo sólido
// com ícone branco. Mantém a timeline visualmente ligada ao resto da tela
// (o badge de status grande no topo usa exatamente essas mesmas cores),
// em vez de introduzir uma paleta nova que não existe em nenhum outro
// lugar do app.
const TIMELINE_TONE: Record<string, string> = {
  created:            'bg-stone-100 text-stone-500 border-stone-200/80 dark:bg-stone-500/10 dark:text-stone-400 dark:border-stone-500/30',
  payment_initiated:  'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30',
  payment_confirmed:  'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  payment_expired:    'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  payment_failed:     'bg-red-50 text-red-700 border-red-200/80 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
  pending_payment:    'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  paid:               'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  preparing:          'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30',
  shipped:            'bg-violet-50 text-violet-700 border-violet-200/80 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30',
  delivery_cancelled: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  delivered:          'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  cancelled:          'bg-red-50 text-red-700 border-red-200/80 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
};
const TIMELINE_TONE_MUTED = 'bg-warm text-faint border-mist';

function timelineLabel(status: string, order: Order): string {
  if (status === 'payment_initiated') {
    return order.payment.method === 'card'
      ? 'Checkout de cartão iniciado'
      : 'PIX gerado, cliente viu o QR code';
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
  if (!d) return '-';
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
    <div className="bg-paper border border-mist rounded-xl overflow-hidden">
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
  useUberSync(
    order?.id,
    order?.delivery?.carrier === 'uber_direct' && !!order.delivery.uberDirectDeliveryId && order.status === 'shipped',
    user,
  );
  const [customer, setCustomer] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [trackingCode, setTrackingCode] = useState('');
  const [pasteFailed, setPasteFailed] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [copied, setCopied]       = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [cancellingDelivery, setCancellingDelivery] = useState(false);
  const [cancelDeliveryError, setCancelDeliveryError] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [cancelOrderError, setCancelOrderError] = useState<string | null>(null);
  const [simulatingPayment, setSimulatingPayment] = useState(false);
  const [simulatePaymentError, setSimulatePaymentError] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnRegistered, setReturnRegistered] = useState(false);
  const [fraudSignals, setFraudSignals] = useState<{ reason: string; relatedOrderIds: string[] }[]>([]);

  useEffect(() => {
    if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
      router.push('/entrar'); return;
    }
    return onSnapshot(doc(db, 'orders', id), snap => {
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
            lateCaptureAt: normalizeDate(raw.payment.lateCaptureAt),
            refundedAt: normalizeDate(raw.payment.refundedAt),
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
      }
      setLoading(false);
    });
  }, [id, user, router]);

  // Cliente buscado uma vez por pedido, não a cada snapshot (antes cada
  // mudança de status refazia a leitura do usuário).
  const orderUserId = order?.userId;
  useEffect(() => {
    if (!orderUserId) return;
    let alive = true;
    getDoc(doc(db, 'users', orderUserId)).then(uSnap => {
      if (!alive || !uSnap.exists()) return;
      const ur = uSnap.data();
      const toIso = (v: unknown) => (typeof v === 'object' && v !== null && 'seconds' in v)
        ? new Date((v as { seconds: number }).seconds * 1000).toISOString()
        : typeof v === 'string' ? v : undefined;
      setCustomer({
        uid: uSnap.id,
        ...ur,
        createdAt: toIso(ur.createdAt) ?? '',
        updatedAt: toIso(ur.updatedAt),
      } as User);
    }).catch(err => {
      // Não deixa uma falha ao buscar dados do cliente travar a tela
      // inteira, o pedido em si já carregou e pode ser exibido.
      console.error('Erro ao buscar dados do cliente:', err);
    });
    return () => { alive = false; };
  }, [orderUserId]);

  // Sinais de fraude leve (endereço/IP compartilhado com outra conta),
  // ver src/lib/fraudSignals.ts. Não bloqueia nada, só avisa o vendedor.
  const orderIdForSignals = order?.id;
  useEffect(() => {
    if (!orderIdForSignals || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/painel/pedidos/${orderIdForSignals}/fraud-signals`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setFraudSignals(data.signals ?? []);
      } catch {
        // Falha silenciosa: é um alerta a mais, não algo crítico pro fluxo do pedido
      }
    })();
    return () => { cancelled = true; };
  }, [orderIdForSignals, user]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function simulatePayment() {
    if (!order) return;
    const { confirmed } = await confirmDialog({
      message: 'Simular pagamento deste PIX?',
      detail: 'Isso confirma o pedido como pago sem nenhum PIX real, só funciona porque este pedido foi criado em modo de teste (Dev Mode da AbacatePay). Nunca disponível em pedidos reais.',
      confirmLabel: 'Simular pagamento',
    });
    if (!confirmed) return;

    setSimulatingPayment(true);
    setSimulatePaymentError(null);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/orders/${id}/simulate-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSimulatePaymentError(data.error ?? 'Não foi possível simular o pagamento.');
        return;
      }
      // O webhook real da AbacatePay confirma o pedido em alguns segundos;
      // o listener onSnapshot já ativo na página atualiza a tela sozinho
      // quando isso acontecer, sem precisar de refresh manual.
    } catch {
      setSimulatePaymentError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setSimulatingPayment(false);
    }
  }

  async function markPaidManually() {
    if (!order) return;
    const { confirmed: hasNote, value: note } = await confirmDialog({
      message: 'Confirmar pagamento por fora',
      detail: 'Descreva como o cliente pagou (aparece no registro do pedido, pra você lembrar depois). Ex: "Dinheiro na retirada", "Transferência direto pro vendedor", "Combinado por WhatsApp".',
      withInput: true,
      inputPlaceholder: 'Como o cliente pagou?',
      confirmLabel: 'Continuar',
    });
    if (!hasNote || !note?.trim()) {
      if (hasNote) await confirmDialog({ message: 'Descreva como o pagamento foi feito.', alertOnly: true });
      return;
    }

    const { confirmed } = await confirmDialog({
      message: 'Marcar este pedido como pago?',
      detail: `"${note.trim()}" — isso confirma o pedido, debita o estoque e envia o e-mail de confirmação pro cliente, exatamente como um pagamento pela AbacatePay. Use só quando o dinheiro já estiver garantido.`,
      confirmLabel: 'Marcar como pago',
      variant: 'danger',
    });
    if (!confirmed) return;

    setMarkingPaid(true);
    setMarkPaidError(null);
    try {
      const token = await user!.getIdToken();
      const send = (force: boolean) => fetch(`/api/orders/${id}/mark-paid-manually`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: note.trim(), force }),
      });
      let res = await send(false);
      let data = await res.json().catch(() => ({}));
      // PIX expirado: a reserva já tinha sido liberada e o item pode ter
      // sido vendido pra outra pessoa nesse meio tempo.
      if (res.status === 409 && data.code === 'INSUFFICIENT_STOCK') {
        const { confirmed: force } = await confirmDialog({
          message: 'Estoque insuficiente',
          detail: 'O PIX deste pedido venceu e a reserva foi liberada. Parte dos itens já não tem estoque livre (pode ter sido vendida pra outro cliente). Se confirmar, o estoque fica negativo e você precisa repor ou ajustar outro pedido.',
          confirmLabel: 'Marcar como pago mesmo assim',
          variant: 'danger',
        });
        if (!force) return;
        res = await send(true);
        data = await res.json().catch(() => ({}));
      }
      if (!res.ok) {
        setMarkPaidError(data.error ?? 'Não foi possível confirmar o pagamento.');
        return;
      }
      // onSnapshot já ativo na página atualiza a tela sozinho.
    } catch {
      setMarkPaidError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setMarkingPaid(false);
    }
  }

  async function advanceStatus() {
    if (!order) return;
    const next = STATUS_NEXT[order.status];
    if (!next) return;

    // Despacho manual (Correios/Jadlog): confirma antes,
    // porque clicar aqui já dispara o e-mail de "pedido enviado" pro cliente,
    // mesmo que o pacote não tenha sido postado de verdade ainda.
    if (order.status === 'preparing' && trackingCode.trim()) {
      const { confirmed } = await confirmDialog({
        message: 'Confirmar despacho?',
        detail: `O cliente recebe o e-mail de "pedido enviado" com o código ${trackingCode.trim()}. Só confirme depois de já ter postado de verdade.`,
        confirmLabel: 'Já postei, confirmar',
      });
      if (!confirmed) return;
    }

    setUpdating(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/orders/${id}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fromStatus: order?.status, ...(trackingCode ? { trackingCode } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        await confirmDialog({
          message: err.error ?? 'Erro ao atualizar status',
          alertOnly: true,
        });
      }
    } catch {
      await confirmDialog({ message: 'Sem conexão. O status não foi alterado, tente de novo.', alertOnly: true });
    } finally { setUpdating(false); }
  }

  async function dispatchDelivery(forceOverspend = false) {
    if (!order) return;
    setUpdating(true);
    setDispatchError(null);
    try {
      const token = await user!.getIdToken();
      const carrier = (order as unknown as { selectedShipping?: { carrier?: string } }).selectedShipping?.carrier ?? 'correios_pac';
      const res = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, carrier, ...(forceOverspend ? { forceOverspend: true } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Uber Direct: custo recotado no despacho ficou acima da margem
        // tolerada, o backend bloqueou de propósito. Pergunta ao vendedor
        // se quer confirmar mesmo assim antes de cobrar o cartão.
        if (data.error === 'overspend_confirmation_required') {
          const { confirmed } = await confirmDialog({
            message: 'Custo da Uber Direct acima do frete cobrado',
            detail: data.message,
            confirmLabel: 'Despachar mesmo assim',
            variant: 'danger',
          });
          if (confirmed) {
            setUpdating(false);
            return dispatchDelivery(true);
          }
          return;
        }
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
      detail: 'Obrigatório, aparece no registro do pedido.',
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
      detail: carrier === 'uber_direct'
        ? 'A corrida será cancelada na Uber e o pedido voltará para "Em preparo".'
        : 'O pedido voltará para "Em preparo" e o código de rastreio será removido.',
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
      const data = await res.json().catch(() => ({}));
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
    // Só pedido já pago teve o estoque debitado (pending_payment/payment_expired não).
    const willReturnStock = order.status !== 'pending_payment' && order.status !== 'payment_expired';
    const { confirmed, value: reason } = await confirmDialog({
      message: 'Cancelar este pedido?',
      detail: `${willReturnStock ? 'O estoque será devolvido. ' : ''}${order.payment.paidAt ? `O cliente já pagou ${formatCurrency(order.totalCents)}: depois de cancelar, devolva o valor pelo mesmo meio de pagamento. O cliente recebe um e-mail avisando do cancelamento. ` : ''}Esta ação não tem como desfazer.`,
      withInput: true,
      inputPlaceholder: 'Motivo, o cliente vai ver (opcional)',
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCancelOrderError(data.error ?? 'Erro ao cancelar pedido'); return; }
      setOrder(prev => prev ? { ...prev, status: 'cancelled' } : prev);
      if (data.uberCancelFailed) {
        setCancelOrderError('Pedido cancelado, mas a corrida na Uber não pôde ser cancelada automaticamente. Cancele pelo app da Uber.');
      }
    } catch {
      setCancelOrderError('Erro de conexão. Tente novamente.');
    } finally {
      setCancellingOrder(false);
    }
  }

  // Estorno pela AbacatePay (valor total). Pagamento por fora não passa por
  // ela: nesse caso o painel só oferece o "Já devolvi por fora".
  async function refundViaAbacate() {
    if (!order) return;
    const { confirmed } = await confirmDialog({
      message: `Estornar ${formatCurrency(order.totalCents)} pela AbacatePay?`,
      detail: 'O valor inteiro volta para o cliente pelo mesmo meio de pagamento. Não tem como desfazer.',
      confirmLabel: 'Estornar agora',
      variant: 'danger',
    });
    if (!confirmed) return;
    setRefunding(true);
    setRefundError(null);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/orders/${order.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setRefundError(data.error ?? 'Não foi possível estornar.');
    } catch {
      setRefundError('Erro de conexão. Confira na AbacatePay antes de tentar de novo.');
    } finally {
      setRefunding(false);
    }
  }

  async function markRefunded() {
    if (!order) return;
    const { confirmed, value: note } = await confirmDialog({
      message: 'Marcar o estorno como feito?',
      detail: `Confirme só depois de devolver ${formatCurrency(order.totalCents)} ao cliente. Fica registrado no histórico do pedido.`,
      withInput: true,
      inputPlaceholder: 'Como foi devolvido (opcional)',
      confirmLabel: 'Estorno feito',
    });
    if (!confirmed) return;
    setRefunding(true);
    setRefundError(null);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/orders/${order.id}/mark-refunded`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: (note ?? '').trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setRefundError(data.error ?? 'Não foi possível registrar o estorno.');
    } catch {
      setRefundError('Erro de conexão. Tente novamente.');
    } finally {
      setRefunding(false);
    }
  }

  async function fixTrackingCode() {
    if (!order) return;
    const { confirmed, value } = await confirmDialog({
      message: 'Corrigir código de rastreio',
      detail: `Código atual: ${order.delivery?.trackingCode ?? 'nenhum'}. O cliente vê o novo código na página do pedido; nenhum e-mail novo é enviado.`,
      withInput: true,
      inputPlaceholder: 'Novo código de rastreio',
      confirmLabel: 'Salvar código',
    });
    if (!confirmed || !value?.trim()) return;
    setCancelDeliveryError(null);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/orders/${order.id}/tracking-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trackingCode: value.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setCancelDeliveryError(data.error ?? 'Não foi possível corrigir o código.');
    } catch {
      setCancelDeliveryError('Erro de conexão. Tente novamente.');
    }
  }

  const isAdmin = user?.role === 'admin';
  // Vendedor: só cancelado sem dinheiro envolvido (como sempre foi).
  // Admin: qualquer pedido, pelo servidor, que desfaz estoque, cupom e Uber.
  const canDelete = !!order && (isAdmin || (order.status === 'cancelled' && !hasMoneyHistory(order)));

  async function handleDelete() {
    if (!order || !canDelete) return;
    const active = order.status !== 'cancelled' && order.status !== 'delivered' && order.status !== 'payment_expired';
    const warnings = [
      active && order.status === 'pending_payment' ? 'A reserva do estoque será liberada.' : null,
      active && order.status !== 'pending_payment' ? 'O estoque destes itens volta para a loja.' : null,
      order.status === 'shipped' && order.delivery?.carrier === 'uber_direct' ? 'A corrida da Uber será cancelada.' : null,
      order.status === 'delivered' ? 'As peças já saíram da loja, então a saída do estoque continua.' : null,
      hasMoneyHistory(order) ? `Pedido pago (${formatCurrency(order.totalCents)}): ele some dos relatórios e do controle de estorno. Se precisar devolver, faça por fora.` : null,
      'Some todo o rastro do pedido (histórico do estoque, uso do cupom, notificações e trocas). O cliente não recebe e-mail. Esta ação não tem como desfazer.',
    ].filter(Boolean).join(' ');
    const { confirmed } = await confirmDialog({
      message: 'Apagar permanentemente este pedido?',
      detail: warnings,
      confirmLabel: 'Apagar pedido',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      if (isAdmin) {
        const token = await user!.getIdToken();
        const res = await fetch(`/api/orders/${order.id}/admin-delete`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Não foi possível apagar o pedido. Tente de novo.');
        if (data.uberCancelFailed) {
          await confirmDialog({ message: 'Pedido apagado, mas a corrida da Uber não pôde ser cancelada. Cancele pelo app da Uber.', alertOnly: true });
        }
      } else {
        await deleteDoc(doc(db, 'orders', id));
      }
      router.push('/painel/pedidos');
    } catch (err) {
      setDeleting(false);
      await confirmDialog({ message: err instanceof Error && isAdmin ? err.message : 'Não foi possível apagar o pedido. Tente de novo.', alertOnly: true });
    }
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto flex flex-col gap-3">
      {[1,2,3,4].map(i => <div key={i} className="h-20 skeleton border border-mist rounded-xl" />)}
    </div>
  );

  if (!order) return <p className="text-sm text-faint py-8 text-center">Pedido não encontrado.</p>;

  const timeline = [...(order.timeline ?? [])].reverse();
  // Só dígitos, sem o 55 (o cadastro guarda o celular com DDD).
  const customerPhone = ((customer as (User & { phone?: string }) | null)?.phone ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '') || null;
  const subtotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const isPickupOrder = (order.delivery?.carrier ?? (order as unknown as { selectedShipping?: { carrier?: string } }).selectedShipping?.carrier) === 'pickup';

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} aria-label="Voltar" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-xl text-faint hover:text-ink hover:bg-paper transition-colors">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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

        {/* ── Sinais de fraude leve (endereço/IP repetido em outra conta) ── */}
        {fraudSignals.length > 0 && (
          <div className="border-2 border-red-400 bg-red-50 px-5 py-4 rounded-xl">
            <p className="text-[14px] font-bold text-ink mb-1">⚠️ Revisar antes de despachar</p>
            <ul className="text-[13px] text-ink/80 list-disc pl-5 space-y-0.5">
              {fraudSignals.map((s, i) => (
                <li key={i}>{s.reason}</li>
              ))}
            </ul>
            <p className="text-[11px] text-faint mt-1">
              Não é uma confirmação de fraude, só um cruzamento simples de dados. Use seu julgamento.
            </p>
          </div>
        )}

        {/* ── Contestação (chargeback/MED) aberta pelo cliente ── */}
        {order.payment.dispute && (
          <div role={order.payment.dispute.state === 'open' ? 'alert' : undefined}
            className={`px-5 py-4 rounded-2xl ${order.payment.dispute.state === 'open' ? 'border-2 border-red-400 bg-red-50' : 'border border-mist bg-warm'}`}>
            <p className="text-[14px] font-bold text-ink mb-1">
              {order.payment.dispute.state === 'open' ? 'Pagamento contestado pelo cliente'
                : order.payment.dispute.state === 'lost' ? 'Contestação perdida: o valor voltou para o cliente'
                : 'Contestação encerrada a favor da loja'}
            </p>
            <p className="text-[13px] text-ink/80 leading-relaxed">
              {order.payment.dispute.state === 'open'
                ? 'Não envie o pedido até resolver. Responda à contestação pelo painel da AbacatePay, com nota e comprovantes.'
                : `Atualizado em ${formatDateTime(order.payment.dispute.at)}.`}
              {order.payment.dispute.reason && order.payment.dispute.reason !== 'Dispute created' ? ` Motivo: ${order.payment.dispute.reason}` : ''}
            </p>
          </div>
        )}

        {/* ── Pagamento recebido com o pedido já cancelado/expirado ── */}
        {order.payment.lateCaptureTxId && !order.payment.paidAt && order.payment.refundStatus !== 'done' && (
          <div role="alert" className="border-2 border-red-400 bg-red-50 px-5 py-4 rounded-2xl">
            <p className="text-[14px] font-bold text-ink mb-1">Pagamento recebido depois do {order.status === 'payment_expired' ? 'vencimento' : 'cancelamento'}</p>
            <p className="text-[13px] text-ink/80 leading-relaxed">
              O cliente pagou {formatCurrency(order.totalCents)}{order.payment.lateCaptureAt ? ` em ${formatDateTime(order.payment.lateCaptureAt)}` : ''}, mas o pedido já estava {order.status === 'payment_expired' ? 'com o PIX vencido' : 'cancelado'}.
              {order.status === 'payment_expired'
                ? ' Se ainda tiver os itens, marque como pago logo abaixo, em Pagamento. Se não, devolva o valor ao cliente.'
                : ' Devolva o valor ao cliente pelo mesmo meio de pagamento.'}
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <button onClick={refundViaAbacate} disabled={refunding || order.payment.refundStatus === 'processing'}
                className="w-full sm:w-auto px-5 bg-red-600 text-white text-[13px] font-semibold py-2.5 hover:bg-red-700 disabled:opacity-50 transition-colors rounded-full">
                {refunding ? 'Estornando…' : order.payment.refundStatus === 'processing' ? 'Estorno em andamento…' : `Estornar ${formatCurrency(order.totalCents)} pela AbacatePay`}
              </button>
              <button onClick={markRefunded} disabled={refunding}
                className="w-full sm:w-auto px-5 border border-red-300 bg-white text-red-700 text-[13px] font-semibold py-2.5 hover:bg-red-100 disabled:opacity-50 transition-colors rounded-full">
                Já devolvi por fora
              </button>
            </div>
            {refundError && <p className="text-[12px] text-red-600 mt-2">{refundError}</p>}
          </div>
        )}

        {/* ── Pedido pago e cancelado: estorno pendente ── */}
        {order.status === 'cancelled' && order.payment.paidAt && (
          order.payment.refundStatus === 'done' ? (
            <div className="border border-mist bg-warm px-5 py-3.5 rounded-2xl text-[13px] text-mid">
              <span className="font-semibold text-ink">Estorno registrado</span>
              {order.payment.refundedAt ? ` em ${formatDateTime(order.payment.refundedAt)}` : ''}.
            </div>
          ) : (
            <div className="border-2 border-amber-400 bg-amber-50 px-5 py-4 rounded-2xl">
              <p className="text-[14px] font-bold text-ink mb-1">Devolva {formatCurrency(order.totalCents)} ao cliente</p>
              <p className="text-[13px] text-ink/80 leading-relaxed">
                {order.payment.confirmedManuallyBy
                  ? 'Este pedido foi pago por fora da AbacatePay e depois cancelado. Devolva pelo mesmo meio e marque aqui quando terminar.'
                  : `Este pedido foi pago (${order.payment.method === 'pix' ? 'PIX' : 'cartão'}) e depois cancelado. O estorno pela AbacatePay devolve o valor inteiro pelo mesmo meio de pagamento.`}
              </p>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                {!order.payment.confirmedManuallyBy && (
                  <button onClick={refundViaAbacate} disabled={refunding || order.payment.refundStatus === 'processing'}
                    className="w-full sm:w-auto px-5 bg-ink text-paper text-[13px] font-semibold py-2.5 hover:bg-ink/80 disabled:opacity-50 transition-colors rounded-full">
                    {refunding ? 'Estornando…' : order.payment.refundStatus === 'processing' ? 'Estorno em andamento…' : `Estornar ${formatCurrency(order.totalCents)} pela AbacatePay`}
                  </button>
                )}
                <button onClick={markRefunded} disabled={refunding}
                  className={`w-full sm:w-auto px-5 text-[13px] font-semibold py-2.5 disabled:opacity-50 transition-colors rounded-full ${order.payment.confirmedManuallyBy ? 'bg-ink text-paper hover:bg-ink/80' : 'border border-mist-d bg-paper text-ink hover:bg-warm'}`}>
                  {order.payment.confirmedManuallyBy ? 'Marcar estorno como feito' : 'Já devolvi por fora'}
                </button>
              </div>
              {refundError && <p className="text-[12px] text-red-600 mt-2">{refundError}</p>}
            </div>
          )
        )}

        {/* ── Alerta de ação necessária ── */}
        {order.status === 'paid' && (
          <div className="border-2 border-clay-l bg-clay-l/5 px-5 py-4 rounded-xl">
            <p className="text-[14px] font-bold text-ink mb-1">Este pedido foi pago e está esperando você!</p>
            <p className="text-[12px] text-mid mb-3">Comece a separar os itens e clique no botão abaixo quando terminar.</p>
            <button onClick={advanceStatus} disabled={updating}
              className="w-full bg-clay-l text-paper text-[13px] font-bold py-3 hover:bg-clay-d disabled:opacity-50 transition-colors rounded-xl">
              {updating ? 'Salvando…' : 'Comecei a separar o pedido'}
            </button>
          </div>
        )}

        {order.status === 'preparing' && (() => {
          const shipping = (order as unknown as { selectedShipping?: { carrier?: string; label?: string; priceCents?: number; estimatedDays?: number } }).selectedShipping;
          const carrier = shipping?.carrier ?? 'correios_pac';
          const isPickup    = carrier === 'pickup';
          const isUberDirect = carrier === 'uber_direct';
          // Correios e Jadlog despacham manual: posta na agência e informa o
          // código de rastreio (sem compra de etiqueta automática).
          const isManualCarrier = isManualDispatch(carrier);
          const isCorreiosCarrier = isCorreios(carrier);
          const codeOk = isValidTrackingCodeFor(carrier, trackingCode);
          const CARRIER_LABELS: Record<string, string> = {
            correios_pac:    'Correios PAC',
            correios_sedex:  'Correios SEDEX',
            jadlog_package:  'Jadlog Package',
            jadlog_expresso: 'Jadlog Expresso',
            pickup:          'Retirada na loja',
            uber_direct:     'Uber Direct',
          };
          return (
            <div className="border border-ink/20 bg-ink/5 px-5 py-4 flex flex-col gap-3 rounded-xl">
              <p className="text-[13px] font-bold text-ink">Pedido sendo separado</p>

              {/* Forma de envio escolhida pelo cliente, não editável */}
              <div className="flex items-center justify-between bg-white dark:bg-warm border border-mist px-4 py-3 rounded-xl">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint mb-0.5">
                    Envio escolhido pelo cliente
                  </p>
                  <p className="text-[13px] font-semibold text-ink">
                    {CARRIER_LABELS[carrier] ?? shipping?.label ?? carrier}
                  </p>
                  {shipping?.estimatedDays !== undefined && !isPickup && (
                    <p className="text-[11px] text-faint mt-0.5">
                      Prazo: {shipping.estimatedDays === 0 ? 'hoje' : plural(shipping.estimatedDays, 'dia útil', 'dias úteis')}
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
                  O cliente vai retirar na loja. Quando ele buscar o pedido, clique em &quot;Confirmar retirada&quot;: o pedido fica como entregue e o cliente recebe o e-mail.
                </p>
              ) : isUberDirect ? (
                <p className="text-[11px] text-faint">
                  Um motoboy Uber será solicitado assim que você clicar. Acompanhe o status em tempo real aqui no painel.
                </p>
              ) : isCorreiosCarrier ? (
                <p className="text-[11px] text-faint">
                  Poste na agência dos Correios e cole aqui o código de rastreio (formato AA123456789BR)
                  pra confirmar o despacho.
                </p>
              ) : isManualCarrier ? (
                <p className="text-[11px] text-faint">
                  Poste numa unidade da Jadlog e cole aqui o código de rastreio do comprovante
                  pra confirmar o despacho.
                </p>
              ) : (
                <p className="text-[11px] text-faint">
                  Forma de envio sem despacho automático. Combine a entrega com o cliente e informe
                  o código de rastreio, se houver.
                </p>
              )}

              {dispatchError && (
                <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{dispatchError}</p>
              )}

              {!isPickup && !isUberDirect ? (
                <>
                  {/* Sem autocorreção nem maiúscula automática: o corretor do
                      celular "consertava" AA123456789BR. Colar lê a área de
                      transferência direto (o app dos Correios copia o código). */}
                  <div className="relative">
                    <input
                      type="text"
                      value={trackingCode}
                      onChange={e => setTrackingCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                      placeholder={isCorreiosCarrier ? 'AA123456789BR' : 'Código de rastreio'}
                      aria-label="Código de rastreio"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={30}
                      className="w-full font-mono text-[13px] tracking-wide border border-mist bg-white dark:bg-warm pl-4 pr-[5.5rem] py-3 rounded-xl focus:outline-none focus:border-ink"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text.trim()) setTrackingCode(text.toUpperCase().replace(/\s+/g, '').slice(0, 30));
                        } catch {
                          setPasteFailed(true);
                        }
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-3.5 rounded-full bg-warm text-[12px] font-semibold text-ink hover:bg-mist transition-colors"
                    >
                      Colar
                    </button>
                  </div>
                  {pasteFailed && (
                    <p className="text-[11px] text-faint">Não deu para ler a área de transferência. Toque e segure no campo para colar.</p>
                  )}
                  {trackingCode.trim().length > 0 && !codeOk && (
                    <p className="text-[11px] text-amber-600">
                      {isCorreiosCarrier
                        ? 'Isso não parece um código dos Correios (formato esperado: AA123456789BR). Confere antes de continuar.'
                        : 'Código muito curto ou longo. Confere antes de continuar.'}
                    </p>
                  )}
                  <button
                    onClick={advanceStatus}
                    disabled={updating || !codeOk}
                    className="w-full bg-ink text-paper text-[13px] font-bold py-3 hover:bg-ink/80 disabled:opacity-50 transition-colors rounded-xl"
                  >
                    {updating ? 'Salvando…' : 'Confirmar despacho'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => dispatchDelivery()}
                  disabled={updating}
                  className="w-full bg-ink text-paper text-[13px] font-bold py-3 hover:bg-ink/80 disabled:opacity-50 transition-colors rounded-xl"
                >
                  {updating
                    ? (isPickup ? 'Salvando…' : 'Solicitando motoboy…')
                    : (isPickup ? 'Confirmar retirada' : 'Solicitar motoboy Uber')}
                </button>
              )}
            </div>
          );
        })()}

        {order.status === 'shipped' && (
          <div className="border border-mist px-5 py-4 flex flex-col gap-3 rounded-xl">
            <p className="text-[13px] font-bold text-ink flex items-center gap-1.5"><IconTruck size={13} className="text-clay" /> Pedido despachado</p>

            {/* ── Uber Direct: entregador em tempo real ─────────────────── */}
            {order.delivery?.carrier === 'uber_direct' && (
              <UberTracking delivery={order.delivery} audience="loja" addressLabel={(() => { const a = toAddress(order.address); return a ? streetLine(a) || undefined : undefined; })()} />
            )}

            {/* Código de rastreio (Correios / Jadlog) */}
            {order.delivery?.trackingCode && (
              <div className="flex items-center justify-between bg-warm px-3 py-2.5 rounded-xl">
                <div>
                  <p className="text-[10px] text-faint mb-0.5">Código de rastreio</p>
                  <p className="text-[13px] font-mono font-bold text-ink">{order.delivery.trackingCode}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={fixTrackingCode}
                    className="text-[11px] font-semibold text-mid hover:text-ink transition-colors">
                    Corrigir
                  </button>
                  <button onClick={() => copy(order.delivery!.trackingCode!, 'tracking')}
                    className="text-[11px] font-semibold text-clay hover:text-clay-d transition-colors">
                    {copied === 'tracking' ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}
            {order.delivery?.trackingUrl && order.delivery?.carrier !== 'uber_direct' && (
              <a href={order.delivery.trackingUrl} target="_blank" rel="noopener noreferrer"
                className="text-[12px] text-clay font-semibold hover:underline">
                Rastrear envio
              </a>
            )}
            {order.delivery?.labelUrl && (
              <a href={order.delivery.labelUrl} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 border border-mist text-mid text-[12px] font-semibold py-2.5 hover:bg-warm transition-colors rounded-xl">
                Reimprimir etiqueta
              </a>
            )}
            <button onClick={advanceStatus} disabled={updating}
              className="w-full bg-ink text-paper text-[13px] font-bold py-3 hover:bg-ink/80 disabled:opacity-50 transition-colors rounded-xl">
              {updating ? 'Salvando…' : 'Confirmar entrega ao cliente'}
            </button>

            {cancelDeliveryError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{cancelDeliveryError}</p>
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
              {customerPhone && (
                <div className="flex justify-between items-center gap-4 py-2.5 border-b border-warm">
                  <span className="text-[12px] text-faint shrink-0">Telefone</span>
                  <span className="flex items-center gap-1.5">
                    <a href={`tel:+55${customerPhone}`} className="text-[13px] font-medium text-ink hover:text-clay transition-colors">{maskPhone(customerPhone)}</a>
                    <a href={`https://wa.me/55${customerPhone}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center min-h-8 px-2.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 transition-colors">
                      WhatsApp
                    </a>
                  </span>
                </div>
              )}
              <Row label="Cliente desde" value={formatDateTime(customer.createdAt)} />
              {customer.address && (
                <Row label="Endereço cadastrado" value={`${customer.address.street}, ${customer.address.number}, ${customer.address.city}/${customer.address.state}`} />
              )}
            </>
          ) : (
            <Row label="ID do cliente" value={order.userId} mono />
          )}
        </Card>

        {/* ── Itens ── */}
        <div className="bg-paper border border-mist rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-mist bg-warm">
            <IconProducts size={14} className="text-mid shrink-0" />
            <p className="text-[12px] font-bold text-ink tracking-wide uppercase">Itens do pedido</p>
          </div>
          <div className="divide-y divide-mist">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                {item.image && (
                  <div className="w-10 h-[52px] shrink-0 overflow-hidden bg-warm border border-mist rounded-xl">
                    <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-ink leading-snug">{item.productName}</p>
                  <p className="text-[11px] text-faint mt-0.5">
                    {item.variant.size}{(item.variant.colorName || item.variant.color) ? ` · ${item.variant.colorName || item.variant.color}` : ''}{item.variant.fabric ? ` · ${item.variant.fabric}` : ''}{' '}
                    · {item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'} · {formatCurrency(item.unitPrice)} cada
                  </p>
                  <p className="text-[10px] font-mono text-faint/60 mt-0.5">SKU: {item.sku}</p>
                  {item.note && (
                    <p className="text-[11px] text-clay font-medium mt-1">⚠ {item.note}</p>
                  )}
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
              <span className="text-[13px] font-bold text-ink">{order.payment.paidAt ? 'Total pago' : 'Total'}</span>
              <span className="font-display text-xl text-ink">{formatCurrency(order.totalCents)}</span>
            </div>
          </div>
        </div>

        {/* ── Pagamento ── */}
        <Card title="Pagamento" icon="card">
          {order.payment.abacateSandbox && (
            <div className="mb-2.5 -mt-1 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-1.5">
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-amber-700">Pagamento de teste</span>
              <span className="text-[10px] text-amber-600">· AbacatePay Dev Mode, nenhum valor real</span>
            </div>
          )}
          <Row label="Método" value={order.payment.method === 'card'
            ? ((order.payment.installments ?? 1) > 1 ? `Cartão ${order.payment.installments}x` : 'Cartão à vista')
            : 'PIX'} />
          {/* Status do PAGAMENTO, não do pedido: "A caminho" aqui confundia. */}
          <Row label="Status" value={
            order.payment.paidAt ? 'Pago'
              : order.payment.lateCaptureTxId ? 'Recebido depois do cancelamento'
              : order.status === 'payment_expired' ? 'PIX expirado'
              : order.status === 'cancelled' ? 'Não pago'
              : 'Aguardando pagamento'
          } />
          <Row label="Pago em" value={order.payment.paidAt ? formatDateTime(order.payment.paidAt) : null} />
          {order.payment.method === 'pix' && (
            <Row label="ID da transação" value={order.payment.txId} mono />
          )}
          {order.payment.method === 'card' && (
            <Row label="Parcelas" value={`${order.payment.installments}x`} />
          )}
          {order.payment.method === 'pix' && order.payment.pixCopyPaste && order.status === 'pending_payment' && (
            <div className="py-2.5 border-b border-warm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-faint">PIX Copia e Cola</span>
                <button onClick={() => copy(order.payment.method === 'pix' ? order.payment.pixCopyPaste! : '', 'pix')}
                  className="text-[11px] font-semibold text-clay hover:text-clay-d transition-colors">
                  {copied === 'pix' ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="text-[10px] font-mono text-faint break-all bg-warm px-2 py-1.5 leading-relaxed rounded-md">
                {order.payment.pixCopyPaste.slice(0, 80)}…
              </p>
            </div>
          )}
          {order.payment.method === 'pix' && order.payment.abacateSandbox && order.status === 'pending_payment' && (
            <div className="pt-3">
              <button
                onClick={simulatePayment}
                disabled={simulatingPayment}
                className="w-full bg-amber-600 text-white text-[13px] font-bold py-2.5 hover:bg-amber-700 disabled:opacity-50 transition-colors rounded-xl"
              >
                {simulatingPayment ? 'Simulando…' : 'Simular pagamento (teste)'}
              </button>
              {simulatePaymentError && (
                <p className="text-[12px] text-red-600 mt-2">{simulatePaymentError}</p>
              )}
            </div>
          )}

          {(order.status === 'pending_payment' || order.status === 'payment_expired') && !order.payment.abacateSandbox && (
            <div className="pt-3 border-t border-warm mt-1">
              <p className="text-[11px] text-faint mb-2 leading-relaxed">
                Cliente pagou por fora (dinheiro, transferência, outra plataforma)? Confirme manualmente, sem esperar o PIX/cartão.
              </p>
              <button
                onClick={markPaidManually}
                disabled={markingPaid}
                className="w-full bg-ink text-paper text-[13px] font-bold py-2.5 hover:bg-ink/80 disabled:opacity-50 transition-colors rounded-xl"
              >
                {markingPaid ? 'Confirmando…' : 'Marcar como pago manualmente'}
              </button>
              {markPaidError && (
                <p className="text-[12px] text-red-600 mt-2">{markPaidError}</p>
              )}
            </div>
          )}

          {order.payment.confirmedManuallyBy && (
            <div className="mt-2.5 px-2.5 py-1.5 bg-warm border border-mist rounded-md">
              <p className="text-[11px] text-mid">
                <span className="font-semibold">Confirmado manualmente</span>{order.payment.confirmedManuallyNote ? ` · ${order.payment.confirmedManuallyNote}` : ''}
              </p>
            </div>
          )}
        </Card>

        {/* ── Endereço de entrega ── */}
        {/* Retirada na loja: o endereço do cliente não serve para nada no
            despacho, então fica recolhido (ainda dá para abrir). */}
        <Card title={isPickupOrder ? 'Retirada na loja' : 'Endereço de entrega'} icon="pin">
          {isPickupOrder ? (
            <details className="group py-2.5">
              <summary className="flex items-center justify-between min-h-10 cursor-pointer list-none text-[12px] text-mid">
                O cliente vai buscar o pedido na loja.
                <span className="text-[11px] font-semibold text-clay group-open:hidden">Ver endereço do cliente</span>
              </summary>
              <p className="text-[12px] text-ink mt-1">
                {order.address.street}, {order.address.number}{order.address.complement ? `, ${order.address.complement}` : ''} · {order.address.neighborhood} · {order.address.city}, {order.address.state} · {maskCep(order.address.cep)}
              </p>
            </details>
          ) : (
            <>
              <Row label="Rua" value={`${order.address.street}, ${order.address.number}${order.address.complement ? `, ${order.address.complement}` : ''}`} />
              <Row label="Bairro" value={order.address.neighborhood} />
              <Row label="Cidade" value={`${order.address.city}, ${order.address.state}`} />
              <Row label="CEP" value={maskCep(order.address.cep)} />
            </>
          )}
          <div className="py-2.5 flex flex-col gap-2">
            {!isPickupOrder && (
            <button
              onClick={() => copy(`${order.address.street}, ${order.address.number}${order.address.complement ? `, ${order.address.complement}` : ''}, ${order.address.neighborhood}, ${order.address.city} - ${order.address.state}, CEP ${maskCep(order.address.cep)}`, 'address')}
              className="w-full border border-mist text-mid text-[12px] font-semibold py-2 hover:bg-warm transition-colors rounded-xl">
              {copied === 'address' ? 'Endereço copiado!' : 'Copiar endereço completo'}
            </button>
            )}
            {order.payment.paidAt && order.status !== 'cancelled' && (
            <Link
              href={`/painel/pedidos/${order.id}/etiqueta`}
              className="flex items-center justify-center gap-1.5 w-full bg-ink text-paper text-[12px] font-semibold py-2 hover:bg-ink/80 transition-colors rounded-xl">
              <IconPrint size={13} /> Imprimir nota de separação (uso interno)
            </Link>
            )}
          </div>
        </Card>

        {/* ── Entrega / Rastreio ── */}
        {order.delivery && (
          <Card title="Entrega" icon="truck">
            <Row label="Transportadora" value={order.delivery.carrier ? carrierNameVendor(order.delivery.carrier) : 'Não definida'} />
            <Row label="Despachado em" value={order.delivery.dispatchedAt ? formatDateTime(order.delivery.dispatchedAt) : null} />
            <Row label="Previsão" value={order.delivery.estimatedDelivery ? formatDateTime(order.delivery.estimatedDelivery) : null} />
            {/* Pedido a caminho já mostra o código no cartão de ação lá em
                cima; aqui ele aparecia de novo (e uma terceira vez no
                Rastreamento). */}
            {order.delivery.trackingCode && order.status !== 'shipped' && (
              <div className="py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-faint">Código de rastreio</span>
                  <button onClick={() => copy(order.delivery!.trackingCode!, 'tracking')}
                    className="text-[11px] font-semibold text-clay hover:text-clay-d transition-colors">
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
                      className="inline-flex items-center min-h-10 text-[12px] font-semibold text-clay hover:text-clay-d transition-colors">
                      Rastrear na transportadora
                    </a>
                  ) : null;
                })()}
              </div>
            )}
          </Card>
        )}

        {/* ── Rastreamento (Correios/Jadlog; Uber Direct já tem o card
             próprio "entregador em tempo real" acima, com ETA e link do
             mapa) ── */}
        {order.delivery?.carrier && order.delivery.carrier !== 'pickup' && order.delivery.carrier !== 'manual' && order.delivery.carrier !== 'uber_direct' && (
          <div className="bg-paper border border-mist rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-mist bg-warm">
              <IconBox size={16} className="text-mid shrink-0" />
              <p className="text-[12px] font-bold text-ink tracking-wide uppercase">Rastreamento</p>
            </div>
            <div className="px-5 py-4">
              <TrackingTimeline
                trackingCode={isCorreios(order.delivery.carrier!) && order.delivery.trackingCode ? order.delivery.trackingCode : undefined}
                orderId={isCorreios(order.delivery.carrier!) && order.delivery.trackingCode ? undefined : order.id}
                carrierName={carrierNameVendor(order.delivery.carrier!)}
              />
            </div>
          </div>
        )}

        {/* ── Histórico do pedido ── */}
        <Card title="Histórico do pedido" icon="clock">
          <div className="py-3">
            {timeline.length === 0 ? (
              <p className="text-[12px] text-faint text-center py-3">Sem histórico registrado.</p>
            ) : (
              <div className="relative">
                {timeline.length > 1 && (
                  <div className="absolute left-[15px] top-4 bottom-4 w-px bg-mist" />
                )}
                <div className="flex flex-col gap-4">
                  {timeline.map((ev, i) => {
                    const TLIcon = TIMELINE_ICON_COMP[ev.status] ?? IconClock;
                    const isLatest = i === 0;
                    const tone = isLatest ? (TIMELINE_TONE[ev.status] ?? TIMELINE_TONE_MUTED) : TIMELINE_TONE_MUTED;
                    return (
                      <div key={i} className="flex items-start gap-3.5">
                        <div className={`shrink-0 rounded-full border flex items-center justify-center relative z-10 transition-all ${tone} ${isLatest ? 'w-8 h-8' : 'w-7 h-7'}`}>
                          <TLIcon size={isLatest ? 14 : 12} />
                        </div>
                        <div className={`flex-1 ${isLatest ? 'pt-1' : 'pt-0.5'}`}>
                          <p className={`leading-snug ${isLatest ? 'text-[13.5px] font-semibold text-ink' : 'text-[13px] font-medium text-mid'}`}>
                            {timelineLabel(ev.status, order)}
                          </p>
                          {ev.note && <p className="text-[12px] text-faint mt-0.5 italic leading-relaxed">{ev.note}</p>}
                          <p className="text-[11px] text-faint mt-1 tabular-nums">{formatDateTime(ev.at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── Info técnica ── */}
        <details className="bg-paper border border-mist rounded-xl overflow-hidden">
          <summary className="flex items-center gap-2 px-5 py-3.5 cursor-pointer select-none bg-warm border-b border-mist">
            <IconMaintenance size={14} className="text-mid shrink-0" />
            <span className="text-[12px] font-bold text-ink tracking-wide uppercase">Informações técnicas</span>
          </summary>
          <div className="px-5 py-1">
            <Row label="ID do pedido" value={order.id} mono />
            <Row label="ID do cliente" value={order.userId} mono />
            <Row label="Criado em" value={formatDateTime(order.createdAt)} />
            <Row label="Última atualização" value={order.updatedAt ? formatDateTime(order.updatedAt) : null} />
          </div>
        </details>

        {/* ── Troca / devolução ── */}
        {order.status !== 'pending_payment' && order.status !== 'payment_expired' && order.status !== 'cancelled' && (
          <div className="flex flex-col gap-2">
            {returnRegistered && (
              <p className="text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                Registrado. Acompanhe em <a href="/painel/trocas" className="underline font-semibold">Trocas</a>.
              </p>
            )}
            <button onClick={() => setReturnModalOpen(true)}
              className="flex items-center justify-center gap-1.5 w-full border border-mist text-mid text-[13px] font-semibold py-3 hover:bg-warm transition-colors rounded-xl">
              <IconExchange size={14} /> Registrar troca ou devolução
            </button>
          </div>
        )}

        {/* ── Cancelar pedido (lojista) ── */}
        {/* Fora do bloco do botão: o aviso de "corrida da Uber não cancelada"
            aparece depois que o pedido já virou cancelado. */}
        {cancelOrderError && (
          <p role="alert" className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{cancelOrderError}</p>
        )}
        {order.status !== 'cancelled' && order.status !== 'delivered' && (
          <div className="flex flex-col gap-2">
            <button onClick={handleCancelOrder} disabled={cancellingOrder}
              className="w-full border border-red-200 bg-red-50 text-red-700 text-[13px] font-semibold py-3 hover:bg-red-100 disabled:opacity-50 transition-colors rounded-xl">
              {cancellingOrder ? 'Cancelando…' : 'Cancelar este pedido'}
            </button>
          </div>
        )}

        {/* ── Apagar ── */}
        {/* Vendedor: só cancelado sem dinheiro envolvido (pedido com dinheiro
            fica pros relatórios e o registro de estorno). Admin: qualquer um. */}
        {canDelete && (
          <button onClick={handleDelete} disabled={deleting}
            className="w-full border border-red-200 bg-red-50 text-red-700 text-[13px] font-semibold py-3 hover:bg-red-100 disabled:opacity-50 transition-colors rounded-xl">
            {deleting ? 'Apagando…' : order.status === 'cancelled' ? 'Apagar este pedido cancelado' : 'Apagar este pedido'}
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

// Pedido que chegou a receber dinheiro (pago antes de cancelar, ou pagamento
// que caiu depois do cancelamento) não pode ser apagado.
function hasMoneyHistory(order: Order): boolean {
  return !!order.payment?.paidAt || !!order.payment?.lateCaptureTxId;
}
