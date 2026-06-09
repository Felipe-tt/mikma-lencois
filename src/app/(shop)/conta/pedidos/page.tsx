'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';
import Link from 'next/link';
import { OrdersListSkeleton } from '@/components/ui/Skeleton';
import { PIXModal } from '@/components/checkout/PIXModal';

const BADGES: Record<string, string> = {
  pending_payment: 'badge-pending',
  paid:            'badge-paid',
  preparing:       'badge-preparing',
  shipped:         'badge-shipped',
  delivered:       'badge-delivered',
  cancelled:       'badge-cancelled',
};
const LABELS: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  paid:            'Pago',
  preparing:       'Em preparo',
  shipped:         'Em rota',
  delivered:       'Entregue',
  cancelled:       'Cancelado',
};

interface PixModalData { qrCode: string; copyPaste: string; orderId: string; totalCents: number }

export default function PedidosPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders]           = useState<Order[]>([]);
  const [ordersLoading, setOL]        = useState(true);
  const [pixModal, setPixModal]       = useState<PixModalData | null>(null);
  const [actionOrderId, setActionOId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    return onSnapshot(
      query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')),
      snap => { setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))); setOL(false); }
    );
  }, [user, loading, router]);

  async function handlePayNow(order: Order) {
    if (!user) return;
    setActionOId(order.id);
    setActionError(e => ({ ...e, [order.id]: '' }));
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch(`/api/orders/${order.id}/regenerate-pix`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro ao gerar PIX');
      const data = await res.json();
      setPixModal({ qrCode: data.qrCode, copyPaste: data.copyPaste, orderId: order.id, totalCents: order.totalCents });
    } catch (err) {
      setActionError(e => ({ ...e, [order.id]: err instanceof Error ? err.message : 'Erro' }));
    } finally {
      setActionOId(null);
    }
  }

  async function handleCancel(order: Order) {
    if (!user || !confirm('Tem certeza que deseja cancelar este pedido?')) return;
    setActionOId(order.id);
    setActionError(e => ({ ...e, [order.id]: '' }));
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch(`/api/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro ao cancelar');
    } catch (err) {
      setActionError(e => ({ ...e, [order.id]: err instanceof Error ? err.message : 'Erro' }));
    } finally {
      setActionOId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="container-shop flex items-end justify-between">
          <div>
            <span className="eyebrow mb-3 block">Conta</span>
            <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl">Meus pedidos</h1>
          </div>
          <Link href="/perfil" className="text-sm text-mid hover:text-clay transition-colors font-medium hidden sm:block">
            Meu perfil
          </Link>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20 max-w-3xl">
        {loading || ordersLoading ? (
          <OrdersListSkeleton />
        ) : orders.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-5 text-center">
            <p className="font-display text-2xl text-ink font-normal">Nenhum pedido ainda</p>
            <p className="text-sm text-mid">Você ainda não fez nenhum pedido.</p>
            <Link href="/produtos" className="btn-primary mt-2">Ver produtos</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map(order => (
              <div key={order.id} className="border border-mist bg-paper">
                {/* Header do pedido */}
                <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 sm:pt-6 pb-4">
                  <div>
                    <p className="text-xs text-faint font-mono mb-1">#{order.id.slice(-10).toUpperCase()}</p>
                    <p className="font-display text-xl sm:text-2xl text-ink">{formatCurrency(order.totalCents)}</p>
                    <p className="text-xs text-faint mt-1">
                      {order.createdAt ? formatTsDateTime(order.createdAt) : '—'}
                    </p>
                  </div>
                  <span className={BADGES[order.status] ?? 'badge'}>
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

                {/* Rastreio */}
                {order.delivery?.trackingCode && (
                  <div className="border-t border-mist px-5 sm:px-6 py-3 flex items-center gap-2 text-xs text-mid">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8zM5.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg>
                    Rastreio: <strong className="text-ink font-mono">{order.delivery.trackingCode}</strong> · {order.delivery.carrier}
                  </div>
                )}

                {/* ── Ações para pedido pendente ── */}
                {order.status === 'pending_payment' && (
                  <div className="border-t border-amber-100 bg-amber-50 px-5 sm:px-6 py-4">
                    <div className="flex items-start gap-3 mb-3">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 shrink-0 mt-0.5">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        Este pedido está aguardando pagamento. Gere o PIX para pagar ou cancele se não quiser mais.
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
                          : '💸 Pagar agora'
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
          onClose={() => setPixModal(null)}
        />
      )}
    </div>
  );
}
