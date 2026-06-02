'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { db } from '@/lib/firebase/client'
import { doc, onSnapshot } from 'firebase/firestore'
import { Order, OrderStatus } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'

const STATUS_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending_payment', label: 'Aguardando pagamento' },
  { status: 'paid', label: 'Pagamento confirmado' },
  { status: 'preparing', label: 'Em preparo' },
  { status: 'shipped', label: 'Em rota' },
  { status: 'delivered', label: 'Entregue' },
]

function stepIndex(status: OrderStatus) {
  const idx = STATUS_STEPS.findIndex((s) => s.status === status)
  return idx === -1 ? 0 : idx
}

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const { user, loading } = useAuth()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/entrar')
  }, [user, loading, router])

  useEffect(() => {
    if (!user || !orderId) return
    const unsub = onSnapshot(doc(db, 'orders', orderId), (snap) => {
      if (snap.exists()) setOrder({ id: snap.id, ...snap.data() } as Order)
    })
    return unsub
  }, [user, orderId])

  function copyPix() {
    if (!order?.payment.pixCopyPaste) return
    navigator.clipboard.writeText(order.payment.pixCopyPaste)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (loading || !order) {
    return <div className="order-detail-loading">Carregando pedido...</div>
  }

  const currentStep = stepIndex(order.status)
  const isCancelled = order.status === 'cancelled'

  return (
    <main className="order-detail-page">
      <div className="order-detail-header">
        <h1 className="order-detail-title">Pedido #{order.id.slice(-8).toUpperCase()}</h1>
        <span className={`order-detail-status order-detail-status--${order.status}`}>
          {STATUS_STEPS.find((s) => s.status === order.status)?.label ?? order.status}
        </span>
      </div>

      {/* Progress bar */}
      {!isCancelled && (
        <div className="order-progress">
          {STATUS_STEPS.map((step, i) => (
            <div key={step.status} className="order-progress-step">
              <div className={`order-progress-dot${i <= currentStep ? ' order-progress-dot--done' : ''}`}>
                {i < currentStep ? '✓' : i + 1}
              </div>
              <span className={`order-progress-label${i <= currentStep ? ' order-progress-label--done' : ''}`}>
                {step.label}
              </span>
              {i < STATUS_STEPS.length - 1 && (
                <div className={`order-progress-line${i < currentStep ? ' order-progress-line--done' : ''}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* PIX payment block */}
      {order.status === 'pending_payment' && order.payment.pixCopyPaste && (
        <div className="order-pix-block">
          <p className="order-pix-title">Pague para confirmar o pedido</p>
          {order.payment.pixQrCode && (
            <img src={order.payment.pixQrCode} alt="QR Code PIX" className="order-pix-qr" />
          )}
          <div className="order-pix-copy-row">
            <span className="order-pix-code">{order.payment.pixCopyPaste}</span>
            <button className="order-pix-btn" onClick={copyPix}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      <div className="order-detail-grid">
        {/* Items */}
        <section className="order-detail-section">
          <h2 className="order-detail-section-title">Itens</h2>
          <div className="order-items-list">
            {order.items.map((item) => (
              <div key={item.sku} className="order-item-row">
                <div className="order-item-info">
                  <span className="order-item-name">{item.productName}</span>
                  <span className="order-item-variant">
                    {item.variant.size} · {item.variant.color} · {item.variant.fabric}
                  </span>
                </div>
                <span className="order-item-qty">×{item.quantity}</span>
                <span className="order-item-price">{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="order-totals">
            {order.discountCents != null && order.discountCents > 0 && (
              <div className="order-total-row order-total-row--discount">
                <span>Desconto</span><span>− {formatCurrency(order.discountCents)}</span>
              </div>
            )}
            <div className="order-total-row order-total-row--final">
              <span>Total</span><span>{formatCurrency(order.totalCents)}</span>
            </div>
          </div>
        </section>

        {/* Address + delivery */}
        <aside className="order-detail-aside">
          <section className="order-detail-section">
            <h2 className="order-detail-section-title">Endereço</h2>
            <address className="order-address">
              {order.address.street}, {order.address.number}
              {order.address.complement && ` — ${order.address.complement}`}
              <br />
              {order.address.neighborhood}, {order.address.city} — {order.address.state}
              <br />
              CEP {order.address.cep}
            </address>
          </section>

          {order.delivery.carrier && (
            <section className="order-detail-section">
              <h2 className="order-detail-section-title">Entrega</h2>
              <p className="order-delivery-carrier">
                {order.delivery.carrier.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </p>
              {order.delivery.trackingCode && (
                <p className="order-delivery-tracking">
                  Rastreio: <strong>{order.delivery.trackingCode}</strong>
                </p>
              )}
              {order.delivery.dispatchedAt && (
                <p className="order-delivery-date">Despachado em {formatDate(order.delivery.dispatchedAt)}</p>
              )}
            </section>
          )}

          <section className="order-detail-section">
            <h2 className="order-detail-section-title">Pagamento</h2>
            <p className="order-payment-method">PIX</p>
            {order.payment.paidAt && (
              <p className="order-payment-date">Confirmado em {formatDate(order.payment.paidAt)}</p>
            )}
          </section>

          <p className="order-created-at">Pedido realizado em {formatDate(order.createdAt)}</p>
        </aside>
      </div>
    </main>
  )
}
