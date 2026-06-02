'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { db } from '@/lib/firebase/client'
import { doc, onSnapshot } from 'firebase/firestore'
import { Cart, Address, DeliveryQuote } from '@/types'
import { formatCurrency } from '@/lib/utils/format'

const emptyAddress: Address = {
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
}

export default function CheckoutPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [cart, setCart] = useState<Cart | null>(null)
  const [address, setAddress] = useState<Address>(emptyAddress)
  const [cepLoading, setCepLoading] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [couponDiscount, setCouponDiscount] = useState(0)
  const [couponError, setCouponError] = useState('')
  const [couponApplied, setCouponApplied] = useState(false)
  const [deliveryQuotes, setDeliveryQuotes] = useState<DeliveryQuote[]>([])
  const [selectedCarrier, setSelectedCarrier] = useState<string>('')
  const [quotesLoading, setQuotesLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pixData, setPixData] = useState<{ qrCode: string; copyPaste: string; orderId: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/entrar?next=/checkout')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'carts', user.uid), (snap) => {
      if (snap.exists()) setCart(snap.data() as Cart)
    })
    return unsub
  }, [user])

  // Pre-fill address from user profile
  useEffect(() => {
    if (!user) return
    import('firebase/firestore').then(({ getDoc }) => {
      getDoc(doc(db, 'users', user.uid)).then((snap) => {
        if (snap.exists() && snap.data().address) {
          setAddress(snap.data().address as Address)
        }
      })
    })
  }, [user])

  const subtotal = cart?.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) ?? 0
  const selectedQuote = deliveryQuotes.find((q) => q.carrier === selectedCarrier)
  const deliveryCents = selectedQuote?.priceCents ?? 0
  const total = subtotal - couponDiscount + deliveryCents

  async function lookupCep(cep: string) {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setAddress((a) => ({
          ...a,
          street: data.logradouro,
          neighborhood: data.bairro,
          city: data.localidade,
          state: data.uf,
          cep: clean,
        }))
        fetchQuotes(clean)
      }
    } finally {
      setCepLoading(false)
    }
  }

  async function fetchQuotes(cep: string) {
    setQuotesLoading(true)
    try {
      const token = await user?.getIdToken()
      const res = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ destinationCep: cep, orderCents: subtotal }),
      })
      const data = await res.json()
      if (data.quotes) {
        setDeliveryQuotes(data.quotes)
        const first = data.quotes.find((q: DeliveryQuote) => q.available)
        if (first) setSelectedCarrier(first.carrier)
      }
    } finally {
      setQuotesLoading(false)
    }
  }

  async function applyCoupon() {
    setCouponError('')
    const token = await user?.getIdToken()
    const res = await fetch('/api/checkout/validate-coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: couponCode, orderCents: subtotal }),
    })
    const data = await res.json()
    if (!res.ok) {
      setCouponError(data.error)
    } else {
      setCouponDiscount(data.discountCents)
      setCouponApplied(true)
    }
  }

  async function handleSubmit() {
    if (!user || !cart || cart.items.length === 0) return
    if (!selectedCarrier) { alert('Selecione uma opção de entrega'); return }
    setSubmitting(true)
    try {
      const token = await user.getIdToken()

      // 1. Create order
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address, couponCode: couponApplied ? couponCode : undefined }),
      })
      const orderData = await orderRes.json()
      if (!orderRes.ok) { alert(orderData.error); setSubmitting(false); return }

      // 2. Create PIX
      const pixRes = await fetch('/api/payment/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: orderData.orderId, amountCents: orderData.totalCents }),
      })
      const pixJson = await pixRes.json()
      if (!pixRes.ok) { alert(pixJson.error); setSubmitting(false); return }

      setPixData({ qrCode: pixJson.qrCode, copyPaste: pixJson.copyPaste, orderId: orderData.orderId })
    } finally {
      setSubmitting(false)
    }
  }

  function copyPix() {
    if (!pixData) return
    navigator.clipboard.writeText(pixData.copyPaste)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (loading || !cart) {
    return <div className="checkout-loading">Carregando...</div>
  }

  if (pixData) {
    return (
      <main className="checkout-pix-page">
        <div className="checkout-pix-card">
          <div className="checkout-pix-icon">💸</div>
          <h1 className="checkout-pix-title">Pedido gerado!</h1>
          <p className="checkout-pix-sub">Pague via PIX para confirmar o pedido</p>
          {pixData.qrCode && (
            <img src={pixData.qrCode} alt="QR Code PIX" className="checkout-pix-qr" />
          )}
          <div className="checkout-pix-copy-row">
            <span className="checkout-pix-code">{pixData.copyPaste}</span>
            <button className="checkout-pix-btn" onClick={copyPix}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="checkout-pix-note">Assim que o pagamento for confirmado você receberá um e-mail.</p>
          <a href={`/pedidos/${pixData.orderId}`} className="checkout-pix-link">
            Acompanhar pedido →
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="checkout-page">
      <h1 className="checkout-title">Finalizar compra</h1>

      <div className="checkout-grid">
        {/* Left: address + delivery + coupon */}
        <div className="checkout-left">
          <section className="checkout-section">
            <h2 className="checkout-section-title">Endereço de entrega</h2>
            <div className="checkout-field-row">
              <div className="checkout-field">
                <label className="checkout-label">CEP</label>
                <input
                  className="checkout-input"
                  placeholder="00000-000"
                  value={address.cep}
                  onChange={(e) => {
                    setAddress((a) => ({ ...a, cep: e.target.value }))
                    lookupCep(e.target.value)
                  }}
                />
                {cepLoading && <span className="checkout-cep-loading">Buscando...</span>}
              </div>
              <div className="checkout-field checkout-field--grow">
                <label className="checkout-label">Rua</label>
                <input
                  className="checkout-input"
                  placeholder="Nome da rua"
                  value={address.street}
                  onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
                />
              </div>
            </div>
            <div className="checkout-field-row">
              <div className="checkout-field">
                <label className="checkout-label">Número</label>
                <input
                  className="checkout-input"
                  placeholder="123"
                  value={address.number}
                  onChange={(e) => setAddress((a) => ({ ...a, number: e.target.value }))}
                />
              </div>
              <div className="checkout-field checkout-field--grow">
                <label className="checkout-label">Complemento</label>
                <input
                  className="checkout-input"
                  placeholder="Apto, bloco..."
                  value={address.complement}
                  onChange={(e) => setAddress((a) => ({ ...a, complement: e.target.value }))}
                />
              </div>
            </div>
            <div className="checkout-field-row">
              <div className="checkout-field checkout-field--grow">
                <label className="checkout-label">Bairro</label>
                <input
                  className="checkout-input"
                  value={address.neighborhood}
                  onChange={(e) => setAddress((a) => ({ ...a, neighborhood: e.target.value }))}
                />
              </div>
              <div className="checkout-field checkout-field--grow">
                <label className="checkout-label">Cidade</label>
                <input
                  className="checkout-input"
                  value={address.city}
                  onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                />
              </div>
              <div className="checkout-field checkout-field--sm">
                <label className="checkout-label">UF</label>
                <input
                  className="checkout-input"
                  maxLength={2}
                  value={address.state}
                  onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value.toUpperCase() }))}
                />
              </div>
            </div>
          </section>

          <section className="checkout-section">
            <h2 className="checkout-section-title">Entrega</h2>
            {quotesLoading && <p className="checkout-quotes-loading">Calculando frete...</p>}
            {!quotesLoading && deliveryQuotes.length === 0 && (
              <p className="checkout-quotes-empty">Informe o CEP para ver as opções de entrega.</p>
            )}
            <div className="checkout-delivery-list">
              {deliveryQuotes.filter((q) => q.available).map((q) => (
                <label key={q.carrier} className={`checkout-delivery-option${selectedCarrier === q.carrier ? ' checkout-delivery-option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="carrier"
                    value={q.carrier}
                    checked={selectedCarrier === q.carrier}
                    onChange={() => setSelectedCarrier(q.carrier)}
                    className="checkout-delivery-radio"
                  />
                  <span className="checkout-delivery-label">{q.label}</span>
                  <span className="checkout-delivery-days">{q.estimatedDays}d úteis</span>
                  <span className="checkout-delivery-price">{formatCurrency(q.priceCents)}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="checkout-section">
            <h2 className="checkout-section-title">Cupom de desconto</h2>
            {couponApplied ? (
              <p className="checkout-coupon-applied">✓ Cupom {couponCode.toUpperCase()} aplicado — {formatCurrency(couponDiscount)} de desconto</p>
            ) : (
              <div className="checkout-coupon-row">
                <input
                  className="checkout-input checkout-coupon-input"
                  placeholder="CÓDIGO"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError('') }}
                />
                <button className="checkout-coupon-btn" onClick={applyCoupon}>Aplicar</button>
              </div>
            )}
            {couponError && <p className="checkout-coupon-error">{couponError}</p>}
          </section>
        </div>

        {/* Right: order summary */}
        <aside className="checkout-summary">
          <h2 className="checkout-summary-title">Resumo</h2>
          <div className="checkout-summary-items">
            {cart.items.map((item) => (
              <div key={item.sku} className="checkout-summary-item">
                <span className="checkout-summary-item-name">{item.productName} <span className="checkout-summary-item-variant">({item.variant.size})</span></span>
                <span className="checkout-summary-item-qty">×{item.quantity}</span>
                <span className="checkout-summary-item-price">{formatCurrency(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="checkout-summary-line">
            <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
          </div>
          {couponDiscount > 0 && (
            <div className="checkout-summary-line checkout-summary-line--discount">
              <span>Desconto</span><span>− {formatCurrency(couponDiscount)}</span>
            </div>
          )}
          <div className="checkout-summary-line">
            <span>Frete</span>
            <span>{selectedQuote ? formatCurrency(deliveryCents) : '—'}</span>
          </div>
          <div className="checkout-summary-total">
            <span>Total</span><span>{formatCurrency(total)}</span>
          </div>
          <button
            className="checkout-submit-btn"
            onClick={handleSubmit}
            disabled={submitting || !selectedCarrier}
          >
            {submitting ? 'Processando...' : 'Gerar PIX'}
          </button>
          <p className="checkout-submit-note">Pagamento 100% via PIX — sem cartão</p>
        </aside>
      </div>
    </main>
  )
}
