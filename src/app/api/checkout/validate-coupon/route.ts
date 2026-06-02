export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { Coupon } from '@/types'
import { z } from 'zod'

const schema = z.object({
  code: z.string().min(1),
  orderCents: z.number().positive(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { code, orderCents } = schema.parse(body)

    const snap = await adminDb.collection('coupons').doc(code.toUpperCase()).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Cupom não encontrado' }, { status: 404 })
    }

    const coupon = snap.data() as Coupon
    const now = new Date()

    if (!coupon.active) {
      return NextResponse.json({ error: 'Cupom inativo' }, { status: 400 })
    }
    if (new Date(coupon.expiresAt) < now) {
      return NextResponse.json({ error: 'Cupom expirado' }, { status: 400 })
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: 'Cupom esgotado' }, { status: 400 })
    }
    if (coupon.minOrderCents && orderCents < coupon.minOrderCents) {
      return NextResponse.json(
        { error: `Pedido mínimo de R$ ${(coupon.minOrderCents / 100).toFixed(2)}` },
        { status: 400 }
      )
    }

    const discountCents =
      coupon.type === 'percent'
        ? Math.round((orderCents * coupon.value) / 100)
        : coupon.value

    return NextResponse.json({ coupon, discountCents })
  } catch {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 })
  }
}
