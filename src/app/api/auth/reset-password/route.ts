export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';

const verifySchema = z.object({
  email: z.string().email().max(256).toLowerCase(),
  token: z.string().min(20).max(100),
});

const resetSchema = z.object({
  email: z.string().email().max(256).toLowerCase(),
  token: z.string().min(20).max(100),
  newPassword: z.string().min(8).max(128),
});

// Verifica token (chamado automaticamente pela página /redefinir-senha ao carregar)
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const ipKey = `reset-verify:${ip}`;
  if (!rateLimit(ipKey, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = verifySchema.safeParse({
    email: searchParams.get('email') ?? '',
    token: searchParams.get('token') ?? '',
  });
  if (!parsed.success) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });

  const { email, token } = parsed.data;
  const snap = await adminDb.collection('password_resets').doc(email).get();
  if (!snap.exists) return NextResponse.json({ error: 'Link expirado. Solicite um novo.' }, { status: 400 });

  const data = snap.data()!;
  if (Date.now() > data.expiresAt) {
    await snap.ref.delete();
    return NextResponse.json({ error: 'Link expirado. Solicite um novo.' }, { status: 400 });
  }
  if (data.attempts >= 10) {
    await snap.ref.delete();
    return NextResponse.json({ error: 'Link inválido. Solicite um novo.' }, { status: 429 });
  }
  if (data.token !== token) {
    await snap.ref.update({ attempts: (data.attempts ?? 0) + 1 });
    return NextResponse.json({ error: 'Link inválido ou já utilizado.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// Redefine senha
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipKey = `reset-password:${ip}`;
  if (!rateLimit(ipKey, 5, 15 * 60 * 1000)) {
    const wait = Math.ceil(rateLimitRetryAfter(ipKey) / 60000);
    return NextResponse.json({ error: `Aguarde ${wait} minuto(s).` }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 }); }

  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const { email, token, newPassword } = parsed.data;
  const ref = adminDb.collection('password_resets').doc(email);
  const snap = await ref.get();

  if (!snap.exists) return NextResponse.json({ error: 'Link expirado. Solicite um novo.' }, { status: 400 });

  const data = snap.data()!;
  if (Date.now() > data.expiresAt) { await ref.delete(); return NextResponse.json({ error: 'Link expirado.' }, { status: 400 }); }
  if (data.attempts >= 10) { await ref.delete(); return NextResponse.json({ error: 'Link inválido.' }, { status: 429 }); }
  if (data.token !== token) {
    await ref.update({ attempts: (data.attempts ?? 0) + 1 });
    return NextResponse.json({ error: 'Link inválido ou já utilizado.' }, { status: 400 });
  }

  try {
    const user = await adminAuth.getUserByEmail(email);

    // Atualiza senha no Firebase Auth
    await adminAuth.updateUser(user.uid, { password: newPassword });

    // Revoga todos os tokens anteriores — força logout em outras sessões
    await adminAuth.revokeRefreshTokens(user.uid);

    // Atualiza hash no Firestore
    const { hash } = await import('@node-rs/argon2');
    const passwordHash = await hash(newPassword, { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 });
    await adminDb.collection('users').doc(user.uid).update({ passwordHash, updatedAt: new Date().toISOString() });

    await ref.delete();

    // NÃO usar createCustomToken aqui — exige iam.serviceAccounts.signBlob
    // na service account do Cloud Run, que não funciona de forma estável
    // neste ambiente de Firebase Hosting com webframeworks (ver mesmo
    // aviso em google-verify/route.ts). O login automático é feito pelo
    // client, que já tem a senha nova em mãos (signInWithEmailAndPassword).
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reset-password]', err);
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 });
  }
}
