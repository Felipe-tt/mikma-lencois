'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import { carrierName } from '@/lib/carriers';
import type { Order } from '@/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { OrdersListSkeleton } from '@/components/ui/Skeleton';
import { PIXModal } from '@/components/checkout/PIXModal';
import { copyText } from '@/lib/clipboard';
import { setReturnTo } from '@/lib/auth/returnTo';
import { requestNewPix } from '@/lib/orders/requestNewPix';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { IconAlert } from '@/components/ui/Icon';

const BADGES: Record<string, string> = {
  pending_payment: 'badge-pending',
  payment_expired: 'badge-pending',
  paid:            'badge-paid',
  preparing:       'badge-preparing',
  shipped:         'badge-shipped',
  delivered:       'badge-delivered',
  cancelled:       'badge-cancelled',
};
const LABELS: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  payment_expired: 'PIX expirado',
  paid:            'Pago',
  preparing:       'Em preparo',
  shipped:         'Em rota',
  delivered:       'Entregue',
  cancelled:       'Cancelado',
};

interface PixModalData { qrCode: string; copyPaste: string; orderId: string; totalCents: number; expiresAt?: string }

export default function PedidosPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders]           = useState<Order[]>([]);
  const [ordersLoading, setOL]        = useState(true);
  const [pixModal, setPixModal]       = useState<PixModalData | null>(null);
  const [actionOrderId, setActionOId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId]       = useState<string | null>(null);
  const [listError, setListError]     = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { setReturnTo('/conta/pedidos'); router.push('/entrar'); return; }
    return onSnapshot(
      query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')),
      snap => { setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))); setOL(false); setListError(false); },
      () => { setOL(false); setListError(true); }
    );
  }, [user, loading, router]);

  async function handlePayNow(order: Order) {
    if (!user) return;
    setActionOId(order.id);
    setActionError(e => ({ ...e, [order.id]: '' }));
    try {
      const data = await requestNewPix(order.id);
      setPixModal({ qrCode: data.qrCode, copyPaste: data.copyPaste, orderId: order.id, totalCents: data.totalCents ?? order.totalCents, expiresAt: data.expiresAt });
    } catch (err) {
      setActionError(e => ({ ...e, [order.id]: err instanceof Error ? err.message : 'Erro' }));
    } finally {
      setActionOId(null);
    }
  }

  async function handleCancel(order: Order) {
    if (!user) return;
    const { confirmed } = await confirmDialog({
      message: 'Cancelar este pedido?',
      detail: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Cancelar pedido',
      variant: 'danger',
    });
    if (!confirmed) return;
    setActionOId(order.id);
    setActionError(e => ({ ...e, [order.id]: '' }));
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch(`/api/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Não foi possível cancelar. Tente de novo.');
    } catch (err) {
      setActionError(e => ({ ...e, [order.id]: err instanceof Error ? err.message : 'Erro' }));
    } finally {
      setActionOId(null);
    }
  }

  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop py-8 sm:py-10 flex items-end justify-between gap-4">
          <div>
            <Link href="/conta" className="group inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.22em] uppercase text-faint hover:text-ink transition-colors duration-150 mb-3">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
              Área do cliente
            </Link>
            <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl">Meus pedidos</h1>
          </div>
          <Link href="/perfil" className="text-sm text-mid hover:text-ink transition-colors font-medium hidden sm:block border-b border-mist-d hover:border-ink pb-px mb-1.5">
            Meu perfil
          </Link>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20 max-w-3xl">
        {listError ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-4 flex items-center justify-between gap-3">
            <span>Não foi possível carregar seus pedidos. Verifique sua conexão.</span>
            <button type="button" onClick={() => window.location.reload()} className="shrink-0 text-xs font-semibold underline underline-offset-2">Tentar de novo</button>
          </div>
        ) : loading || ordersLoading ? (
          <OrdersListSkeleton />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
            title="Nenhum pedido ainda"
            description="Quando você fizer uma compra, ela vai aparecer aqui."
            actions={[{ label: 'Ver produtos', href: '/produtos' }]}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map(order => (
              <div key={order.id} className="rounded-2xl overflow-hidden border border-mist bg-paper">
                {/* Header do pedido */}
                <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 sm:pt-6 pb-4">
                  <div className="flex items-start gap-4">
                    {/* Thumbnail do primeiro item */}
                    {order.items[0]?.image && (
                      <div className="relative w-12 h-[60px] shrink-0 overflow-hidden rounded-lg bg-warm border border-mist/60">
                        <img src={order.items[0].image} alt={order.items[0].productName} className="w-full h-full object-cover" />
                        {order.items.length > 1 && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-ink/80 text-paper text-[9px] font-bold flex items-center justify-center rounded-full">
                            +{order.items.length - 1}
                          </span>
                        )}
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] text-faint font-mono mb-1">#{order.id.slice(-10).toUpperCase()}</p>
                      <p className="font-display text-xl sm:text-2xl text-ink">{formatCurrency(order.totalCents)}</p>
                      <p className="text-[11px] text-faint mt-1 whitespace-nowrap">
                        {order.createdAt ? formatTsDateTime(order.createdAt) : '-'}
                      </p>
                      {/* No celular o selo vai embaixo: do lado ele quebrava
                          em duas linhas e espremia a data. */}
                      <span className={`${BADGES[order.status] ?? 'badge'} sm:!hidden mt-2.5 whitespace-nowrap`}>
                        {LABELS[order.status] ?? order.status}
                      </span>
                    </div>
                  </div>
                  <span className={`${BADGES[order.status] ?? 'badge'} !hidden sm:!inline-flex shrink-0 whitespace-nowrap`}>
                    {LABELS[order.status] ?? order.status}
                  </span>
                </div>

                {/* Itens */}
                <div className="border-t border-mist px-5 sm:px-6 py-4 flex flex-col gap-2">
                  {order.items.map(item => (
                    <div key={item.sku} className="flex justify-between text-sm text-mid">
                      <span className="font-medium text-ink truncate mr-4">{item.productName}</span>
                      <span className="shrink-0">{item.quantity}× {formatCurrency(item.unitPrice)}</span>
                    </div>
                  ))}
                </div>

                {/* CTA de avaliação, só em pedidos entregues */}
                {order.status === 'delivered' && (
                  <div className="border-t border-mist px-5 sm:px-6 py-3 flex flex-wrap gap-x-4 gap-y-1.5">
                    {order.items.map(item => (
                      <Link
                        key={item.sku}
                        href={`/produtos/${item.productId}#avaliacoes`}
                        className="text-[11px] font-semibold text-clay hover:text-clay-d transition-colors uppercase tracking-[0.06em]"
                      >
                        Avaliar {item.productName.length > 24 ? item.productName.slice(0, 24) + '…' : item.productName}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Rastreio inline com copiar */}
                {order.delivery?.trackingCode && (
                  <div className="border-t border-mist px-5 sm:px-6 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[12px] text-mid min-w-0">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-faint"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8zM5.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg>
                      {order.delivery.carrier && (
                        <span className="text-faint shrink-0">{carrierName(order.delivery.carrier)} ·</span>
                      )}
                      <span className="font-mono font-semibold text-ink truncate">{order.delivery.trackingCode}</span>
                    </div>
                    <button
                      onClick={async () => {
                        if (await copyText(order.delivery!.trackingCode!)) {
                          setCopiedId(order.id);
                          setTimeout(() => setCopiedId(c => (c === order.id ? null : c)), 2000);
                        }
                      }}
                      className="shrink-0 text-[10px] font-semibold text-clay hover:text-clay-d transition-colors uppercase tracking-[0.08em]"
                    >
                      {copiedId === order.id ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                )}

                {/* ── Ações para pedido pendente ── */}
                {(order.status === 'pending_payment' || order.status === 'payment_expired') && (
                  <div className="border-t border-amber-100 bg-amber-50 px-5 sm:px-6 py-4">
                    <div className="flex items-start gap-3 mb-3">
                      <IconAlert size={16} className="text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 leading-relaxed">
                        {order.status === 'payment_expired'
                          ? 'O PIX deste pedido expirou. Gere um novo código para pagar.'
                          : 'Este pedido está aguardando pagamento. Gere o PIX para pagar ou cancele se não quiser mais.'}
                      </p>
                    </div>

                    {actionError[order.id] && (
                      <p className="text-xs text-red-600 mb-3">{actionError[order.id]}</p>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handlePayNow(order)}
                        disabled={actionOrderId === order.id}
                        className="btn-clay text-xs px-5 py-2.5 font-semibold tracking-wide"
                      >
                        {actionOrderId === order.id
                          ? <><span className="spinner w-3.5 h-3.5" /> Gerando…</>
                          : order.status === 'payment_expired' ? 'Gerar novo PIX' : 'Pagar agora'
                        }
                      </button>
                      <button
                        onClick={() => handleCancel(order)}
                        disabled={actionOrderId === order.id}
                        className="text-xs text-mid hover:text-red-600 transition-colors font-medium underline underline-offset-2"
                      >
                        Cancelar pedido
                      </button>
                    </div>
                  </div>
                )}

                {/* Link para detalhe */}
                {order.status !== 'pending_payment' && (
                  <div className="border-t border-mist px-5 sm:px-6 py-3">
                    <Link href={`/pedidos/${order.id}`} className="text-xs font-medium text-mid hover:text-clay transition-colors">
                      Ver detalhes
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal PIX gerado via "Pagar agora" */}
      {pixModal && (
        <PIXModal
          qrCode={pixModal.qrCode}
          copyPaste={pixModal.copyPaste}
          orderId={pixModal.orderId}
          totalCents={pixModal.totalCents}
          expiresAt={pixModal.expiresAt}
          onClose={() => setPixModal(null)}
        />
      )}
    </div>
  );
}
