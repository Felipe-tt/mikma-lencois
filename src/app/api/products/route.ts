import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { z } from 'zod'

const VariantSchema = z.object({
  size: z.string(),
  color: z.string().optional(),
  fabric: z.string().optional(),
  sku: z.string(),
})

const ProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(10),
  priceCents: z.number().int().positive(),
  images: z.array(z.string().url()).min(1),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  variants: z.array(VariantSchema).min(1),
  active: z.boolean().default(true),
})

async function getSellerFromRequest(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7))
    if (decoded.role !== 'seller' && decoded.role !== 'admin') return null
    return decoded
  } catch {
    return null
  }
}

export async function GET() {
  const snap = await adminDb.collection('products').orderBy('createdAt', 'desc').get()
  const products = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  return NextResponse.json({ products })
}

export async function POST(req: NextRequest) {
  const seller = await getSellerFromRequest(req)
  if (!seller) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const parse = ProductSchema.safeParse(body)
  if (!parse.success) return NextResponse.json({ error: parse.error.flatten() }, { status: 400 })

  const ref = adminDb.collection('products').doc()
  await ref.set({ ...parse.data, slug: ref.id, createdAt: new Date(), updatedAt: new Date() })

  // Create inventory docs for each variant
  const batch = adminDb.batch()
  for (const variant of parse.data.variants) {
    const invRef = adminDb.collection('inventory').doc(variant.sku)
    batch.set(invRef, {
      productId: ref.id,
      variant,
      quantity: 0,
      reserved: 0,
      lowStockThreshold: 5,
      history: [],
      updatedAt: new Date(),
    })
  }
  await batch.commit()

  return NextResponse.json({ id: ref.id }, { status: 201 })
}
