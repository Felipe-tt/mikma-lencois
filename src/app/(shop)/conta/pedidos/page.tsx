'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';
import Link from 'next/link';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pagamento', paid: 'Pago', preparing: 'Em preparo',
  shipped: 'Em rota', delivered: 'Entregue', cancelled: 'Cancelado',
};
const STATUS_COLOR: Record<string, string> = {
  pending_payment: '#B45309', paid: '#166534', preparing: '#1E40AF',
  shipped: '#6B21A8', delivered: '#166534', cancelled: '#991B1B',
};
const STATUS_BG: Record<string, string> = {
  pending_payment: '#FEF3C7', paid: '#DCFCE7', preparing: '#DBEAFE',
  shipped: '#F3E8FF', delivered: '#DCFCE7', cancelled: '#FEE2E2',
};

export default function PedidosPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    const q = query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      setOrdersLoading(false);
    });
  }, [user, loading, router]);

  if (loading || ordersLoading) return (
    <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-l)' }}>Carregando…</p>
    </div>
  );

  return (
    <div style={{ background: 'var(--white)', minHeight: '60vh' }}>
      <div style={{ borderBottom: '1px solid var(--cream-d)', background: 'var(--cream)', padding: '36px 0' }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p className="section-label" style={{ marginBottom: 6 }}>Conta</p>
              <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 34, fontWeight: 300, color: 'var(--ink)' }}>Meus pedidos</h1>
            </div>
            <Link href="/perfil" style={{ fontSize: 12, color: 'var(--ink-l)', textDecoration: 'none' }} className="hover:text-ink transition-colors">Meu perfil →</Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8" style={{ paddingTop: 40, paddingBottom: 80 }}>
        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: 'var(--ink-l)', fontWeight: 300 }}>Nenhum pedido ainda</p>
            <Link href="/produtos" className="btn-primary">Ver produtos</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {orders.map(order => (
              <div key={order.id} style={{ border: '1px solid var(--cream-d)', background: 'var(--white)', padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--ink-l)', fontFamily: 'monospace', marginBottom: 4 }}>
                      #{order.id.slice(-8).toUpperCase()}
                    </p>
                    <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: 'var(--ink)' }}>{formatCurrency(order.totalCents)}</p>
                    <p style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 2 }}>
                      {order.createdAt ? formatDateTime(new Date((order.createdAt as unknown as { seconds: number }).seconds * 1000).toISOString()) : '—'}
                    </p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px',
                    background: STATUS_BG[order.status] ?? '#F3F4F6', color: STATUS_COLOR[order.status] ?? '#374151' }}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </div>

                <div style={{ borderTop: '1px solid var(--cream-d)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {order.items.map(item => (
                    <div key={item.sku} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-m)' }}>
                      <span>{item.productName} × {item.quantity}</span>
                      <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                {order.delivery?.trackingCode && (
                  <p style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-l)', paddingTop: 12, borderTop: '1px solid var(--cream-d)' }}>
                    Rastreio: <span style={{ fontWeight: 600, color: 'var(--ink-m)', fontFamily: 'monospace' }}>{order.delivery.trackingCode}</span>
                    {' · '}{order.delivery.carrier}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
