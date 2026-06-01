import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  recaptchaToken: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const { email, password } = parsed.data

    // Find user by email
    const userRecord = await adminAuth.getUserByEmail(email).catch(() => null)
    if (!userRecord) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    // Get password hash from Firestore
    const userDoc = await adminDb.collection('users').doc(userRecord.uid).get()
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    const { passwordHash } = userDoc.data() as { passwordHash: string }

    // Verify Argon2id hash
    const { verify } = await import('@node-rs/argon2')
    const valid = await verify(passwordHash, password)
    if (!valid) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    // Issue custom token
    const claims = userRecord.customClaims ?? {}
    const customToken = await adminAuth.createCustomToken(userRecord.uid, claims)

    return NextResponse.json({ customToken })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
