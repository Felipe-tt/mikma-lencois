import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { CartItem, Order, Address } from '@/types'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'

const addressSchema = z.object({
  cep: z.string().min(8),
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().optional(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
})

const schema = z.object({
  couponCode: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const token = authHeader.slice(7)
    const decoded = await adminAuth.verifyIdToken(token)
    const uid = decoded.uid

    const body = await req.json()
    const { couponCode } = schema.parse(body)
    const address: Address = addressSchema.parse(body.address)

    // Load cart from Firestore
    const cartSnap = await adminDb.collection('carts').doc(uid).get()
    if (!cartSnap.exists) {
      return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 })
    }
    const cart = cartSnap.data()!
    const items: CartItem[] = cart.items ?? []
    if (items.length === 0) {
      return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 })
    }

    const subtotalCents = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
    let discountCents = 0

    // Validate coupon if provided
    if (couponCode) {
      const couponSnap = await adminDb.collection('coupons').doc(couponCode.toUpperCase()).get()
      if (couponSnap.exists) {
        const coupon = couponSnap.data()!
        if (coupon.active && new Date(coupon.expiresAt) > new Date()) {
          discountCents =
            coupon.type === 'percent'
              ? Math.round((subtotalCents * coupon.value) / 100)
              : coupon.value
          // Increment usage
          await couponSnap.ref.update({ usedCount: FieldValue.increment(1) })
        }
      }
    }

    const totalCents = Math.max(0, subtotalCents - discountCents)

    // Create order doc
    const orderRef = adminDb.collection('orders').doc()
    const order: Omit<Order, 'id'> = {
      userId: uid,
      items,
      status: 'pending_payment',
      payment: { method: 'pix', txId: '' },
      delivery: { carrier: null },
      address,
      totalCents,
      discountCents,
      couponCode: couponCode?.toUpperCase(),
      createdAt: new Date().toISOString(),
    }
    await orderRef.set(order)

    // Save address to user profile for future checkouts
    await adminDb.collection('users').doc(uid).update({ address })

    return NextResponse.json({ orderId: orderRef.id, totalCents, discountCents })
  } catch (err) {
    console.error('create-order error', err)
    return NextResponse.json({ error: 'Erro ao criar pedido' }, { status: 500 })
  }
}
