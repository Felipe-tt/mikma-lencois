'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/firebase/client'
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore'
import { Order } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import Link from 'next/link'

interface KPIs {
  todayOrders: number
  todayRevenue: number
  monthOrders: number
  monthRevenue: number
  pendingOrders: number
}

export default function SellerDashboard() {
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [kpis, setKpis] = useState<KPIs>({ todayOrders: 0, todayRevenue: 0, monthOrders: 0, monthRevenue: 0, pendingOrders: 0 })

  useEffect(() => {
    // Recent 10 orders
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(10))
    const unsub = onSnapshot(q, (snap) => {
      const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order))
      setRecentOrders(orders)

      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const paid = orders.filter((o) => o.status !== 'pending_payment' && o.status !== 'cancelled')
      const today = paid.filter((o) => o.createdAt >= todayStart)
      const month = paid.filter((o) => o.createdAt >= monthStart)
      const pending = orders.filter((o) => o.status === 'pending_payment')

      setKpis({
        todayOrders: today.length,
        todayRevenue: today.reduce((s, o) => s + o.totalCents, 0),
        monthOrders: month.length,
        monthRevenue: month.reduce((s, o) => s + o.totalCents, 0),
        pendingOrders: pending.length,
      })
    })
    return unsub
  }, [])

  const STATUS_LABEL: Record<string, string> = {
    pending_payment: 'Aguardando pag.',
    paid: 'Pago',
    preparing: 'Em preparo',
    shipped: 'Em rota',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
  }

  return (
    <div className="dashboard-page">
      <h1 className="dashboard-title">Dashboard</h1>

      <div className="dashboard-kpi-grid">
        <div className="dashboard-kpi">
          <span className="dashboard-kpi-label">Pedidos hoje</span>
          <span className="dashboard-kpi-value">{kpis.todayOrders}</span>
        </div>
        <div className="dashboard-kpi">
          <span className="dashboard-kpi-label">Receita hoje</span>
          <span className="dashboard-kpi-value">{formatCurrency(kpis.todayRevenue)}</span>
        </div>
        <div className="dashboard-kpi">
          <span className="dashboard-kpi-label">Pedidos no mês</span>
          <span className="dashboard-kpi-value">{kpis.monthOrders}</span>
        </div>
        <div className="dashboard-kpi">
          <span className="dashboard-kpi-label">Receita no mês</span>
          <span className="dashboard-kpi-value">{formatCurrency(kpis.monthRevenue)}</span>
        </div>
        <div className={`dashboard-kpi${kpis.pendingOrders > 0 ? ' dashboard-kpi--alert' : ''}`}>
          <span className="dashboard-kpi-label">Aguardando pag.</span>
          <span className="dashboard-kpi-value">{kpis.pendingOrders}</span>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="dashboard-section-header">
          <h2 className="dashboard-section-title">Pedidos recentes</h2>
          <Link href="/painel/pedidos" className="dashboard-section-link">Ver todos →</Link>
        </div>
        <div className="dashboard-orders-table">
          <div className="dashboard-orders-head">
            <span>Pedido</span>
            <span>Status</span>
            <span>Data</span>
            <span>Total</span>
            <span></span>
          </div>
          {recentOrders.map((order) => (
            <div key={order.id} className="dashboard-orders-row">
              <span className="dashboard-order-id">#{order.id.slice(-8).toUpperCase()}</span>
              <span className={`dashboard-order-status dashboard-order-status--${order.status}`}>
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
              <span className="dashboard-order-date">{formatDate(order.createdAt)}</span>
              <span className="dashboard-order-total">{formatCurrency(order.totalCents)}</span>
              <Link href={`/painel/pedidos/${order.id}`} className="dashboard-order-link">Ver</Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
