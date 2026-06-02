export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  recaptchaToken: z.string(),
})

async function verifyRecaptcha(token: string): Promise<boolean> {
  const res = await fetch(
    `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    { method: 'POST' }
  )
  const data = await res.json()
  return data.success && data.score >= 0.5
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const { name, email, password, recaptchaToken } = parsed.data

    // Verify reCAPTCHA
    const captchaOk = await verifyRecaptcha(recaptchaToken)
    if (!captchaOk) {
      return NextResponse.json({ error: 'reCAPTCHA inválido' }, { status: 400 })
    }

    // Hash password with Argon2id
    const { hash } = await import('@node-rs/argon2')
    const passwordHash = await hash(password, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      outputLen: 32,
    })

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({ email, displayName: name })

    // Set role claim
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: 'buyer' })

    // Save user profile in Firestore
    await adminDb.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      email,
      role: 'buyer',
      passwordHash,
      lgpdConsent: {
        date: new Date().toISOString(),
        version: '1.0',
      },
      createdAt: new Date().toISOString(),
    })

    // Return custom token for client sign-in
    const customToken = await adminAuth.createCustomToken(userRecord.uid, { role: 'buyer' })

    return NextResponse.json({ customToken }, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro interno'
    if (msg.includes('email-already-exists')) {
      return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
