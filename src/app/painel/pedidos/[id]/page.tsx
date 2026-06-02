'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useAuth } from '@/lib/auth/AuthContext'
import type { Order } from '@/types'

const STATUS_LABELS: Record<Order['status'], string> = {
  pending_payment: 'Aguardando Pagamento',
  paid: 'Pago',
  preparing: 'Em Preparo',
  shipped: 'Despachado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

const STATUS_NEXT: Partial<Record<Order['status'], Order['status']>> = {
  paid: 'preparing',
  preparing: 'shipped',
  shipped: 'delivered',
}

export default function PainelPedidoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const { user, role } = useAuth()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [trackingCode, setTrackingCode] = useState('')

  useEffect(() => {
    if (!user || (role !== 'seller' && role !== 'admin')) {
      router.push('/entrar')
      return
    }
    const unsub = onSnapshot(doc(db, 'orders', id), snap => {
      if (snap.exists()) setOrder({ id: snap.id, ...snap.data() } as Order)
      setLoading(false)
    })
    return () => unsub()
  }, [id, user, role, router])

  async function advanceStatus() {
    if (!order) return
    const next = STATUS_NEXT[order.status]
    if (!next) return
    setUpdating(true)
    try {
      const update: Record<string, unknown> = { status: next, updatedAt: serverTimestamp() }
      if (next === 'shipped' && trackingCode) {
        update['delivery.trackingCode'] = trackingCode
        update['delivery.dispatchedAt'] = serverTimestamp()
      }
      await updateDoc(doc(db, 'orders', id), update)
    } finally {
      setUpdating(false)
    }
  }

  async function dispatchDelivery() {
    if (!order) return
    setUpdating(true)
    try {
      const res = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, address: order.address, items: order.items }),
      })
      const data = await res.json()
      if (data.trackingCode) setTrackingCode(data.trackingCode)
    } finally {
      setUpdating(false)
    }
  }

  if (loading) return <div className="p-8 text-text-secondary">Carregando...</div>
  if (!order) return <div className="p-8 text-text-secondary">Pedido não encontrado.</div>

  const nextStatus = STATUS_NEXT[order.status]

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-text-secondary hover:text-text-primary text-sm">
          ← Voltar
        </button>
        <h1 className="text-xl font-semibold text-text-primary">Pedido #{order.id.slice(-8).toUpperCase()}</h1>
      </div>

      {/* Status */}
      <div className="bg-background-primary border border-border-tertiary rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Status atual</span>
          <span className="font-medium text-text-primary">{STATUS_LABELS[order.status]}</span>
        </div>

        {order.status === 'preparing' && (
          <div className="space-y-2">
            <label className="text-sm text-text-secondary">Código de rastreio</label>
            <input
              className="w-full border border-border-secondary rounded-md px-3 py-2 text-sm bg-background-primary text-text-primary focus:outline-none focus:border-border-primary"
              placeholder="BR123456789BR"
              value={trackingCode}
              onChange={e => setTrackingCode(e.target.value)}
            />
            <button
              onClick={dispatchDelivery}
              disabled={updating}
              className="w-full bg-background-info text-text-info border border-border-info rounded-md py-2 text-sm font-medium hover:opacity-80 disabled:opacity-50"
            >
              {updating ? 'Processando...' : 'Acionar entrega (Uber Direct / Melhor Envio)'}
            </button>
          </div>
        )}

        {nextStatus && (
          <button
            onClick={advanceStatus}
            disabled={updating}
            className="w-full bg-background-success text-text-success border border-border-success rounded-md py-2 text-sm font-medium hover:opacity-80 disabled:opacity-50"
          >
            {updating ? 'Salvando...' : `Avançar para: ${STATUS_LABELS[nextStatus]}`}
          </button>
        )}
      </div>

      {/* Itens */}
      <div className="bg-background-primary border border-border-tertiary rounded-lg p-5">
        <h2 className="text-sm font-medium text-text-primary mb-4">Itens do pedido</h2>
        <div className="space-y-3">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-border-tertiary last:border-0">
              <div>
                <p className="text-sm text-text-primary">{item.productName}</p>
                <p className="text-xs text-text-secondary">{`${item.variant.size} · ${item.variant.color}`} · Qtd: {item.quantity}</p>
              </div>
              <span className="text-sm font-medium text-text-primary">
                R$ {((item.unitPrice * item.quantity) / 100).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between pt-3 font-medium text-text-primary">
          <span>Total</span>
          <span>R$ {(order.totalCents / 100).toFixed(2)}</span>
        </div>
      </div>

      {/* Endereço */}
      <div className="bg-background-primary border border-border-tertiary rounded-lg p-5">
        <h2 className="text-sm font-medium text-text-primary mb-3">Endereço de entrega</h2>
        <address className="text-sm text-text-secondary not-italic space-y-1">
          <p>{order.address.street}, {order.address.number}{order.address.complement ? ` — ${order.address.complement}` : ''}</p>
          <p>{order.address.neighborhood} · {order.address.city} — {order.address.state}</p>
          <p>CEP {order.address.cep}</p>
        </address>
      </div>

      {/* Entrega */}
      {order.delivery && (
        <div className="bg-background-primary border border-border-tertiary rounded-lg p-5">
          <h2 className="text-sm font-medium text-text-primary mb-3">Entrega</h2>
          <div className="space-y-2 text-sm text-text-secondary">
            {order.delivery.carrier && <p>Transportadora: <span className="text-text-primary">{order.delivery.carrier}</span></p>}
            {order.delivery.trackingCode && <p>Rastreio: <span className="text-text-primary font-mono">{order.delivery.trackingCode}</span></p>}
          </div>
        </div>
      )}
    </div>
  )
}
