import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { piiPatch, readPii } from '@/lib/piiCrypto';
import { validateCpf, validatePhone } from '@/lib/validation/signup';

/**
 * CPF e telefone do próprio perfil. Ficam criptografados no banco (ver
 * lib/piiCrypto.ts), então o checkout e o perfil leem e gravam por aqui, e
 * não direto no Firestore.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { allowWithoutSecondFactor: true });
  if (!auth.ok) return auth.response;
  const snap = await adminDb.collection('users').doc(auth.decoded.uid).get();
  return NextResponse.json(readPii(snap.data()), { headers: { 'Cache-Control': 'private, no-store' } });
}

const schema = z.object({
  cpf: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
}).strict();

export async function PUT(req: NextRequest) {
  const auth = await verifyAuth(req, { allowWithoutSecondFactor: true });
  if (!auth.ok) return auth.response;
  if (!await rateLimit(`user-pii:${auth.decoded.uid}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas alterações. Aguarde alguns minutos.' }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const values: { cpf?: string; phone?: string } = {};
  if (parsed.data.cpf !== undefined) {
    const r = validateCpf(parsed.data.cpf);
    if (!r.ok) return NextResponse.json({ error: r.error, field: 'cpf' }, { status: 400 });
    values.cpf = r.value;
  }
  if (parsed.data.phone !== undefined) {
    const r = validatePhone(parsed.data.phone);
    if (!r.ok) return NextResponse.json({ error: r.error, field: 'phone' }, { status: 400 });
    values.phone = r.value;
  }
  if (!Object.keys(values).length) return NextResponse.json({ ok: true });

  await adminDb.collection('users').doc(auth.decoded.uid).set(piiPatch(values), { merge: true });
  return NextResponse.json({ ok: true });
}
