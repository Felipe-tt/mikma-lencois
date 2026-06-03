export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
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

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await adminDb.collection('products').doc(id).get()
  if (!snap.exists) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ id: snap.id, ...snap.data() })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const seller = await getSeller(req)
  if (!seller) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const allowed = z.object({
    name: z.string().min(2).optional(),
    description: z.string().min(10).optional(),
    price: z.number().int().positive().optional(),
    images: z.array(z.string()).optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    active: z.boolean().optional(),
  }).safeParse(body)

  if (!allowed.success) return NextResponse.json({ error: allowed.error.flatten() }, { status: 400 })

  await adminDb.collection('products').doc(id).update({
    ...allowed.data,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const seller = await getSeller(req)
  if (!seller) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params
  await adminDb.collection('products').doc(id).update({
    active: false,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return NextResponse.json({ ok: true })
}
