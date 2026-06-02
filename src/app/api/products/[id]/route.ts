import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { z } from 'zod'

async function getSeller(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7))
    if (decoded.role !== 'seller' && decoded.role !== 'admin') return null
    return decoded
  } catch { return null }
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const snap = await adminDb.collection('products').doc(params.id).get()
  if (!snap.exists) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ id: snap.id, ...snap.data() })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const seller = await getSeller(req)
  if (!seller) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const allowed = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    priceCents: z.number().int().positive().optional(),
    images: z.array(z.string()).optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    active: z.boolean().optional(),
  }).safeParse(body)

  if (!allowed.success) return NextResponse.json({ error: allowed.error.flatten() }, { status: 400 })

  await adminDb.collection('products').doc(params.id).update({ ...allowed.data, updatedAt: new Date() })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const seller = await getSeller(req)
  if (!seller) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  // Soft delete
  await adminDb.collection('products').doc(params.id).update({ active: false, updatedAt: new Date() })
  return NextResponse.json({ ok: true })
}
