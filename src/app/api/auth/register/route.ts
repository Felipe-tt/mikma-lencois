export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { verifyRecaptcha } from '@/lib/recaptcha';
import { LEGAL_VERSION } from '@/lib/legal';
import { sanitizeDisplayName } from '@/lib/html';
import { validateEmail, validatePhone, validateCpf } from '@/lib/validation/signup';
import { checkPassword, PASSWORD_MAX } from '@/lib/validation/password';

const schema = z
  .object({
    email: z.string().max(320).transform((v, ctx) => {
      const r = validateEmail(v);
      if (!r.ok) { ctx.addIssue({ code: 'custom', message: r.error }); return z.NEVER; }
      return r.value;
    }),
    password: z.string().max(PASSWORD_MAX, `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`),
    phone: z.string().max(30).optional().transform((v, ctx) => {
      const r = validatePhone(v ?? '');
      if (!r.ok) { ctx.addIssue({ code: 'custom', message: r.error }); return z.NEVER; }
      return r.value || undefined;
    }),
    cpf: z.string().max(20).optional().transform((v, ctx) => {
      const r = validateCpf(v ?? '');
      if (!r.ok) { ctx.addIssue({ code: 'custom', message: r.error }); return z.NEVER; }
      return r.value || undefined;
    }),
    recaptchaToken: z.string().min(1).optional(),
  });

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  if (!await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
    const wait = Math.ceil(rateLimitRetryAfter(`register:${ip}`) / 60000);
    return NextResponse.json(
      { error: `Muitas tentativas. Tente novamente em ${wait} minuto(s).` },
      { status: 429, headers: { 'Retry-After': String(wait * 60) } }
    );
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Dados inválidos' },
      { status: 400 }
    );
  }

  const { email, password, phone, cpf, recaptchaToken } = parsed.data;

  if (!await verifyRecaptcha(recaptchaToken, 'register')) {
    return NextResponse.json(
      { error: 'Verificação de segurança falhou. Recarregue a página e tente novamente.' },
      { status: 400 }
    );
  }

  // ── Exige verificação prévia do e-mail ──────────────────────────────────
  const verifyRef = adminDb.collection('email_verifications').doc(email);
  const verifySnap = await verifyRef.get();

  if (!verifySnap.exists) {
    return NextResponse.json(
      { error: 'Confirme seu e-mail antes de criar a conta.' },
      { status: 403 }
    );
  }

  const vData = verifySnap.data()!;

  if (!vData.verified) {
    return NextResponse.json(
      { error: 'E-mail não confirmado. Clique no link enviado por e-mail.' },
      { status: 403 }
    );
  }

  if (Date.now() > vData.expiresAt + 30 * 60 * 1000) {
    // Dá 30 min extras após verificar para preencher o cadastro
    await verifyRef.delete();
    return NextResponse.json(
      { error: 'Sessão expirada. Comece o cadastro novamente.' },
      { status: 403 }
    );
  }

  const name: string = sanitizeDisplayName(vData.name) || 'Cliente';

  // Tamanho, força (zxcvbn pt-br), senhas vazadas (HIBP) e termos do contexto.
  const passwordReport = await checkPassword(password, { email, name });
  if (!passwordReport.ok) {
    return NextResponse.json({ error: passwordReport.error }, { status: 400 });
  }

  try {
    // A senha fica SÓ no Firebase Auth (hash irreversível gerenciado pelo
    // Google). Não guardamos cópia no Firestore: nenhum código a lia, e o
    // documento users/{uid} é legível pela equipe.
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true, // já verificamos por código
    });

    await adminAuth.setCustomUserClaims(userRecord.uid, { role: 'buyer' });

    await adminDb.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      email,
      role: 'buyer',
      emailVerified: true,
      ...(phone ? { phone } : {}),
      ...(cpf ? { cpf } : {}),
      lgpdConsent: { date: new Date().toISOString(), version: LEGAL_VERSION, ip },
      createdAt: new Date().toISOString(),
    });

    // Remove verificação usada
    await verifyRef.delete();

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('email-already-exists')) {
      return NextResponse.json({ error: 'Este e-mail já está cadastrado.' }, { status: 409 });
    }
    console.error('[register]', error);
    return NextResponse.json({ error: 'Erro ao criar conta. Tente novamente.' }, { status: 500 });
  }
}
