export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'

const VariantSchema = z.object({
  id: z.string(),
  size: z.enum(['solteiro', 'casal', 'queen', 'king']),
  color: z.string().optional().default(''),
  fabric: z.string().optional().default(''),
})

const ProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(10),
  price: z.number().int().positive(), // centavos — campo canônico
  images: z.array(z.string()).min(1),
  category: z.string().min(1),
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
  const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return NextResponse.json({ products })
}

export async function POST(req: NextRequest) {
  const seller = await getSellerFromRequest(req)
  if (!seller) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const parse = ProductSchema.safeParse(body)
  if (!parse.success) return NextResponse.json({ error: parse.error.flatten() }, { status: 400 })

  const data = parse.data
  const ref = adminDb.collection('products').doc()

  await ref.set({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Criar docs de inventário para cada variação
  const batch = adminDb.batch()
  for (const variant of data.variants) {
    const sku = `${ref.id}_${variant.id}`
    const invRef = adminDb.collection('inventory').doc(sku)
    batch.set(invRef, {
      productId: ref.id,
      variant,
      quantity: 0,
      reserved: 0,
      lowStockThreshold: 5,
      history: [],
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
  await batch.commit()

  return NextResponse.json({ id: ref.id }, { status: 201 })
}
