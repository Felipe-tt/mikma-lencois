import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { timingSafeEqual } from 'node:crypto';
import { hashTicket } from '@/lib/auth/loginTicket';

const schema = z.object({
  email: z.string().email().max(256).toLowerCase(),
  challenge: z.string().min(32).max(128),
});

/**
 * Só devolve confirmed:true/false — nunca revela se o e-mail existe ou
 * não (login_challenges/{email} só existe quando a senha já foi
 * confirmada certa, ver login/route.ts), nem nenhum outro dado.
 * Chamado a cada poucos segundos pela tela de login enquanto ela espera
 * a pessoa clicar no link do e-mail. Só responde à aba que pediu o login
 * (id do desafio): quem só sabe o e-mail, ou só tem a senha, não descobre
 * quando a dona da conta confirmou.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (!await rateLimit(`login-challenge-status:${ip}`, 60, 5 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = schema.safeParse({ email: searchParams.get('email') ?? '', challenge: searchParams.get('challenge') ?? '' });
  if (!parsed.success) return NextResponse.json({ confirmed: false });

  const snap = await adminDb.collection('login_challenges').doc(parsed.data.email).get();
  if (!snap.exists) return NextResponse.json({ confirmed: false });

  const data = snap.data()!;
  const expected = Buffer.from(String(data.challengeHash ?? ''));
  const given = Buffer.from(hashTicket(parsed.data.challenge));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return NextResponse.json({ confirmed: false });
  if (Date.now() > data.expiresAt) return NextResponse.json({ confirmed: false, expired: true });

  return NextResponse.json({ confirmed: data.confirmed === true });
}
