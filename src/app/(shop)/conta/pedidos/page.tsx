'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';
import Link from 'next/link';
import { OrdersListSkeleton } from '@/components/ui/Skeleton';

const BADGES: Record<string, string> = {
  pending_payment:'badge-pending', paid:'badge-paid', preparing:'badge-preparing',
  shipped:'badge-shipped', delivered:'badge-delivered', cancelled:'badge-cancelled',
};
const LABELS: Record<string, string> = {
  pending_payment:'Aguardando pagamento', paid:'Pago', preparing:'Em preparo',
  shipped:'Em rota', delivered:'Entregue', cancelled:'Cancelado',
};

export default function PedidosPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    return onSnapshot(
      query(collection(db,'orders'), where('userId','==',user.uid), orderBy('createdAt','desc')),
      snap => { setOrders(snap.docs.map(d => ({id:d.id,...d.data()} as Order))); setOrdersLoading(false); }
    );
  }, [user, loading, router]);

  return (
    <div>
      <div className="page-header">
        <div className="container-shop flex items-end justify-between">
          <div>
            <span className="eyebrow mb-3 block">Conta</span>
            <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl">Meus pedidos</h1>
          </div>
          <Link href="/perfil" className="text-sm text-mid hover:text-clay transition-colors font-medium hidden sm:block">
            Meu perfil →
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
              <div key={order.id} className="border border-mist bg-paper p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <p className="text-xs text-faint font-mono mb-1">#{order.id.slice(-10).toUpperCase()}</p>
                    <p className="font-display text-xl sm:text-2xl text-ink">{formatCurrency(order.totalCents)}</p>
                    <p className="text-xs text-faint mt-1">
                      {order.createdAt ? formatTsDateTime(order.createdAt) : '—'}
                    </p>
                  </div>
                  <span className={BADGES[order.status] ?? 'badge badge-default'}>
                    {LABELS[order.status] ?? order.status}
                  </span>
                </div>
                <div className="border-t border-mist pt-4 flex flex-col gap-2">
                  {order.items.map(item => (
                    <div key={item.sku} className="flex justify-between text-sm text-mid">
                      <span className="font-medium text-ink truncate mr-4">{item.productName}</span>
                      <span className="shrink-0">{item.quantity}× {formatCurrency(item.unitPrice)}</span>
                    </div>
                  ))}
                </div>
                {order.delivery?.trackingCode && (
                  <div className="mt-4 pt-4 border-t border-mist flex items-center gap-2 text-xs text-mid">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8zM5.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg>
                    <span>Rastreio: <strong className="text-ink font-mono">{order.delivery.trackingCode}</strong> · {order.delivery.carrier}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
