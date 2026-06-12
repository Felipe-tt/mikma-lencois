'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { db } from '@/lib/firebase/client';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Order } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { OrdersListSkeleton } from '@/components/ui/Skeleton';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  paid: 'Pago',
  preparing: 'Em preparo',
  shipped: 'Em rota',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const STATUS_BADGE: Record<string, string> = {
  pending_payment: 'badge-pending',
  paid: 'badge-paid',
  preparing: 'badge-preparing',
  shipped: 'badge-shipped',
  delivered: 'badge-delivered',
  cancelled: 'badge-cancelled',
};

export default function MyOrdersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push('/entrar?next=/pedidos');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order)));
      setOrdersLoading(false);
    });
    return unsub;
  }, [user]);

  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop">
          <span className="eyebrow mb-3 block">Histórico</span>
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl">Meus pedidos</h1>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20 max-w-3xl">
        {loading || ordersLoading ? (
          <OrdersListSkeleton />
        ) : orders.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-5 text-center">
            <div className="w-16 h-16 bg-warm flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-faint">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <p className="font-display text-2xl text-ink font-normal">Nenhum pedido ainda</p>
            <p className="text-sm text-mid">Explore nossos produtos e faça seu primeiro pedido.</p>
            <Link href="/produtos" className="btn-primary mt-2">Ver produtos</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/pedidos/${order.id}`}
                className="border border-mist bg-paper hover:border-clay/40 hover:shadow-md hover:shadow-ink/5 transition-all duration-250 p-5 sm:p-6 flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    <p className="text-2xs font-semibold tracking-[0.18em] uppercase text-faint">Pedido</p>
                    <p className="font-mono text-sm font-semibold text-ink">#{order.id.slice(-8).toUpperCase()}</p>
                    <p className="text-xs text-faint mt-0.5">{formatDate(order.createdAt)}</p>
                  </div>
                  <span className={STATUS_BADGE[order.status] ?? 'badge badge-pending'}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </div>

                <div className="border-t border-mist pt-3 flex items-end justify-between gap-3">
                  <p className="text-sm text-mid line-clamp-2 flex-1">
                    {order.items.map((item) => `${item.productName} ×${item.quantity}`).join(', ')}
                  </p>
                  <p className="font-display text-xl text-ink shrink-0">{formatCurrency(order.totalCents)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
