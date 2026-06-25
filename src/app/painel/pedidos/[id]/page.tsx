'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, updateDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Order, OrderTimelineEvent, User } from '@/types';
import { TrackingTimeline } from '@/components/tracking/TrackingTimeline';
import { formatCurrency } from '@/lib/utils/format';

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
  payment_initiated: 'PIX gerado — cliente viu o QR code',
  payment_confirmed: 'Pagamento confirmado',
  payment_expired: 'PIX expirou sem pagamento',
  payment_failed: 'Pagamento recusado',
  pending_payment: 'Aguardando pagamento',
  paid: 'Pagamento recebido',
  preparing: 'Começou a separar o pedido',
  shipped: 'Pedido despachado',
  delivered: 'Pedido entregue ao cliente',
  cancelled: 'Pedido cancelado',
};
const TIMELINE_ICON: Record<string, string> = {
  created: '🛍', payment_initiated: '⏳', payment_confirmed: '✅',
  payment_expired: '⌛', payment_failed: '❌', pending_payment: '⏳',
  paid: '💰', preparing: '📦', shipped: '🚚', delivered: '🎉', cancelled: '✕',
};
const TIMELINE_COLOR: Record<string, string> = {
  created: 'bg-[#E6DFD5]', payment_initiated: 'bg-blue-300', payment_confirmed: 'bg-emerald-400',
  payment_expired: 'bg-orange-400', payment_failed: 'bg-red-400', pending_payment: 'bg-yellow-300',
  paid: 'bg-emerald-400', preparing: 'bg-blue-400', shipped: 'bg-purple-400',
  delivered: 'bg-emerald-500', cancelled: 'bg-red-400',
};

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
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-[#F0EBE1] last:border-0">
      <span className="text-[12px] text-[#B09C8C] shrink-0">{label}</span>
      <span className={`text-[13px] text-[#1E1208] text-right ${mono ? 'font-mono text-[11px] break-all' : 'font-medium'}`}>{value}</span>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#FAF8F5] border border-[#E6DFD5]">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#E6DFD5] bg-[#F0EAE1]">
        <span>{icon}</span>
        <p className="text-[12px] font-bold text-[#1E1208] tracking-wide uppercase">{title}</p>
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
  const [copied, setCopied] = useState<string | null>(null);

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
      const now = new Date().toISOString();
      const newEvent: OrderTimelineEvent = { status: next, at: now };
      const update: Record<string, unknown> = {
        status: next, updatedAt: serverTimestamp(),
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
    if (!confirm('Apagar permanentemente este pedido? Não tem como desfazer.')) return;
    setDeleting(true);
    try { await deleteDoc(doc(db, 'orders', id)); router.push('/painel/pedidos'); }
    catch { setDeleting(false); }
  }

  if (loading) return (
    <div className="max-w-2xl flex flex-col gap-3">
      {[1,2,3,4].map(i => <div key={i} className="h-20 skeleton border border-mist" />)}
    </div>
  );

  if (!order) return <p className="text-sm text-[#B09C8C] py-8 text-center">Pedido não encontrado.</p>;

  const nextStatus = STATUS_NEXT[order.status];
  const timeline = [...(order.timeline ?? [])].reverse();
  const subtotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-[#B09C8C] hover:text-[#1E1208] transition-colors p-1 -ml-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="font-display font-normal text-[#1E1208] text-xl">Pedido #{order.id.slice(-8).toUpperCase()}</h1>
          <p className="text-[11px] text-[#B09C8C]">Criado em {formatDateTime(order.createdAt)}</p>
        </div>
        <span className={STATUS_BADGE[order.status] ?? 'badge'}>
          {STATUS_LABELS[order.status]}
        </span>
      </div>

      <div className="flex flex-col gap-4">

        {/* ── Alerta de ação necessária ── */}
        {order.status === 'paid' && (
          <div className="border-2 border-[#C4714A] bg-[#C4714A]/5 px-5 py-4">
            <p className="text-[14px] font-bold text-[#1E1208] mb-1">Este pedido foi pago e está esperando você!</p>
            <p className="text-[12px] text-[#705A48] mb-3">Comece a separar os itens e clique no botão abaixo quando terminar.</p>
            <button onClick={advanceStatus} disabled={updating}
              className="w-full bg-[#C4714A] text-white text-[13px] font-bold py-3 hover:bg-[#A05432] disabled:opacity-50 transition-colors">
              {updating ? 'Salvando…' : 'Comecei a separar o pedido'}
            </button>
          </div>
        )}

        {order.status === 'preparing' && (
          <div className="border border-[#1E1208]/20 bg-[#1E1208]/5 px-5 py-4 flex flex-col gap-3">
            <p className="text-[13px] font-bold text-[#1E1208]">Pedido sendo separado</p>
            <div>
              <label className="block text-[11px] font-semibold text-[#705A48] mb-1.5">
                Código de rastreio — Correios ou Jadlog (opcional)
              </label>
              <input className="w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20"
                placeholder="Correios: BR123456789BR · Jadlog: JD12345678" value={trackingCode} onChange={e => setTrackingCode(e.target.value)} />
              <p className="mt-1.5 text-[11px] text-[#B09C8C]">O cliente receberá um e-mail com o código assim que você despachar.</p>
            </div>

            <button onClick={advanceStatus} disabled={updating}
              className="w-full bg-[#1E1208] text-white text-[13px] font-bold py-3 hover:bg-[#1E1208]/80 disabled:opacity-50 transition-colors">
              {updating ? 'Salvando…' : 'Pedido embalado — despachar agora'}
            </button>
          </div>
        )}

        {order.status === 'shipped' && (
          <div className="border border-[#E6DFD5] px-5 py-4">
            <p className="text-[13px] font-bold text-[#1E1208] mb-3">Pedido a caminho do cliente</p>
            <button onClick={advanceStatus} disabled={updating}
              className="w-full bg-[#1E1208] text-white text-[13px] font-bold py-3 hover:bg-[#1E1208]/80 disabled:opacity-50 transition-colors">
              {updating ? 'Salvando…' : 'Confirmar entrega ao cliente'}
            </button>
          </div>
        )}

        {/* ── Cliente ── */}
        <Card title="Cliente" icon="👤">
          {customer ? (
            <>
              <Row label="Nome" value={customer.name} />
              <Row label="E-mail" value={customer.email} />
              <Row label="CPF" value={customer.cpf ? '••••••••••• (criptografado)' : 'Não informado'} />
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
        <div className="bg-[#FAF8F5] border border-[#E6DFD5]">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#E6DFD5] bg-[#F0EAE1]">
            <span>🛍</span>
            <p className="text-[12px] font-bold text-[#1E1208] tracking-wide uppercase">Itens do pedido</p>
          </div>
          <div className="divide-y divide-[#E6DFD5]">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                {item.image && (
                  <div className="w-10 h-[52px] shrink-0 overflow-hidden bg-[#F0EBE1] border border-[#E6DFD5]">
                    <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#1E1208] leading-snug">{item.productName}</p>
                  <p className="text-[11px] text-[#B09C8C] mt-0.5">
                    {item.variant.size}{item.variant.color ? ` · ${item.variant.color}` : ''}{item.variant.fabric ? ` · ${item.variant.fabric}` : ''}{' '}
                    · {item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'} · {formatCurrency(item.unitPrice)} cada
                  </p>
                  <p className="text-[10px] font-mono text-[#B09C8C]/60 mt-0.5">SKU: {item.sku}</p>
                </div>
                <span className="text-[13px] font-semibold text-[#1E1208] shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-[#E6DFD5] flex flex-col gap-1.5">
            <div className="flex justify-between text-[12px] text-[#B09C8C]">
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            {order.discountCents ? (
              <div className="flex justify-between text-[12px] text-emerald-600">
                <span>Desconto {order.couponCode ? `(cupom ${order.couponCode})` : ''}</span>
                <span>- {formatCurrency(order.discountCents)}</span>
              </div>
            ) : null}
            <div className="flex justify-between pt-2 border-t border-[#E6DFD5]">
              <span className="text-[13px] font-bold text-[#1E1208]">Total pago</span>
              <span className="font-display text-xl text-[#1E1208]">{formatCurrency(order.totalCents)}</span>
            </div>
          </div>
        </div>

        {/* ── Pagamento ── */}
        <Card title="Pagamento" icon="💳">
          <Row label="Método" value={order.payment.method.toUpperCase()} />
          <Row label="Status" value={STATUS_LABELS[order.status]} />
          <Row label="Pago em" value={order.payment.paidAt ? formatDateTime(order.payment.paidAt) : null} />
          <Row label="ID da transação" value={order.payment.txId} mono />
          {order.payment.pixCopyPaste && (
            <div className="py-2.5 border-b border-[#F0EBE1]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-[#B09C8C]">PIX Copia e Cola</span>
                <button onClick={() => copy(order.payment.pixCopyPaste!, 'pix')}
                  className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors">
                  {copied === 'pix' ? '✓ Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="text-[10px] font-mono text-[#B09C8C] break-all bg-[#F0EBE1] px-2 py-1.5 leading-relaxed">
                {order.payment.pixCopyPaste.slice(0, 80)}…
              </p>
            </div>
          )}
        </Card>

        {/* ── Endereço de entrega ── */}
        <Card title="Endereço de entrega" icon="📍">
          <Row label="Rua" value={`${order.address.street}, ${order.address.number}${order.address.complement ? ` — ${order.address.complement}` : ''}`} />
          <Row label="Bairro" value={order.address.neighborhood} />
          <Row label="Cidade" value={`${order.address.city} — ${order.address.state}`} />
          <Row label="CEP" value={order.address.cep} />
          <div className="py-2.5">
            <button
              onClick={() => copy(`${order.address.street}, ${order.address.number}${order.address.complement ? `, ${order.address.complement}` : ''}, ${order.address.neighborhood}, ${order.address.city} - ${order.address.state}, CEP ${order.address.cep}`, 'address')}
              className="w-full border border-[#E6DFD5] text-[#705A48] text-[12px] font-semibold py-2 hover:bg-[#F0EBE1] transition-colors">
              {copied === 'address' ? '✓ Endereço copiado!' : 'Copiar endereço completo'}
            </button>
          </div>
        </Card>

        {/* ── Entrega / Rastreio ── */}
        {order.delivery && (
          <Card title="Entrega" icon="🚚">
            <Row label="Transportadora" value={order.delivery.carrier ?? 'Não definida'} />
            <Row label="Despachado em" value={order.delivery.dispatchedAt ? formatDateTime(order.delivery.dispatchedAt) : null} />
            <Row label="Previsão" value={order.delivery.estimatedDelivery ? formatDateTime(order.delivery.estimatedDelivery) : null} />
            {order.delivery.trackingCode && (
              <div className="py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-[#B09C8C]">Código de rastreio</span>
                  <button onClick={() => copy(order.delivery!.trackingCode!, 'tracking')}
                    className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors">
                    {copied === 'tracking' ? '✓ Copiado!' : 'Copiar'}
                  </button>
                </div>
                <p className="font-mono text-[13px] text-[#1E1208] font-bold">{order.delivery.trackingCode}</p>
              </div>
            )}
          </Card>
        )}

        {/* ── Rastreamento Correios ── */}
        {order.delivery?.trackingCode && (
          <div className="bg-[#FAF8F5] border border-[#E6DFD5]">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#E6DFD5] bg-[#F0EAE1]">
              <span>📦</span>
              <p className="text-[12px] font-bold text-[#1E1208] tracking-wide uppercase">Rastreamento Correios</p>
              <span className="ml-auto font-mono text-[11px] text-[#705A48]">{order.delivery.trackingCode}</span>
            </div>
            <div className="px-5 py-4">
              <TrackingTimeline trackingCode={order.delivery.trackingCode} />
            </div>
          </div>
        )}

        {/* ── Histórico do pedido ── */}
        <Card title="Histórico do pedido" icon="🕐">
          <div className="py-3">
            {timeline.length === 0 ? (
              <p className="text-[12px] text-[#B09C8C] text-center py-3">Sem histórico registrado.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {timeline.map((ev, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`w-2.5 h-2.5 shrink-0 mt-1.5 ${TIMELINE_COLOR[ev.status] ?? 'bg-[#E6DFD5]'}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{TIMELINE_ICON[ev.status] ?? '•'}</span>
                        <p className="text-[13px] font-semibold text-[#1E1208]">{TIMELINE_LABEL[ev.status] ?? ev.status}</p>
                      </div>
                      {ev.note && <p className="text-[12px] text-[#705A48] mt-0.5 ml-7">{ev.note}</p>}
                      <p className="text-[11px] text-[#B09C8C] mt-0.5 ml-7 tabular-nums">{formatDateTime(ev.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ── Info técnica ── */}
        <details className="bg-[#FAF8F5] border border-[#E6DFD5]">
          <summary className="flex items-center gap-2 px-5 py-3.5 cursor-pointer select-none bg-[#F0EAE1] border-b border-[#E6DFD5]">
            <span>🔧</span>
            <p className="text-[12px] font-bold text-[#1E1208] tracking-wide uppercase">Informações técnicas</p>
          </summary>
          <div className="px-5 py-1">
            <Row label="ID do pedido" value={order.id} mono />
            <Row label="ID do cliente" value={order.userId} mono />
            <Row label="Criado em" value={formatDateTime(order.createdAt)} />
            <Row label="Última atualização" value={order.updatedAt ? formatDateTime(order.updatedAt) : null} />
          </div>
        </details>

        {/* ── Apagar se cancelado ── */}
        {order.status === 'cancelled' && (
          <button onClick={handleDelete} disabled={deleting}
            className="w-full border border-red-200 bg-red-50 text-red-700 text-[13px] font-semibold py-3 hover:bg-red-100 disabled:opacity-50 transition-colors">
            {deleting ? 'Apagando…' : 'Apagar este pedido cancelado'}
          </button>
        )}
      </div>
    </div>
  );
}
