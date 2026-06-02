'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/AuthContext'
import { db } from '@/lib/firebase/client'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { Order } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  paid: 'Pago',
  preparing: 'Em preparo',
  shipped: 'Em rota',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

export default function MyOrdersPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    if (!loading && !user) router.push('/entrar?next=/pedidos')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order)))
    })
    return unsub
  }, [user])

  if (loading) return <div className="orders-loading">Carregando...</div>

  return (
    <main className="orders-page">
      <h1 className="orders-title">Meus pedidos</h1>
      {orders.length === 0 ? (
        <div className="orders-empty">
          <p className="orders-empty-text">Você ainda não fez nenhum pedido.</p>
          <Link href="/produtos" className="orders-empty-link">Ver produtos →</Link>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <Link key={order.id} href={`/pedidos/${order.id}`} className="orders-card">
              <div className="orders-card-top">
                <span className="orders-card-id">#{order.id.slice(-8).toUpperCase()}</span>
                <span className={`orders-card-status orders-card-status--${order.status}`}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              <div className="orders-card-items">
                {order.items.map((item) => (
                  <span key={item.sku} className="orders-card-item">
                    {item.productName} ×{item.quantity}
                  </span>
                ))}
              </div>
              <div className="orders-card-bottom">
                <span className="orders-card-date">{formatDate(order.createdAt)}</span>
                <span className="orders-card-total">{formatCurrency(order.totalCents)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
