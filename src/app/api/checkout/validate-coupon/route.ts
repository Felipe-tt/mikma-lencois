export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { Coupon } from '@/types';
import { z } from 'zod';
import { rateLimit } from '@/lib/rateLimit';
import { validateCoupon } from '@/lib/orderPricing';
import { getClientIp } from '@/lib/security';

const schema = z.object({
  code: z.string().min(1).max(32).regex(/^[A-Z0-9_-]+$/i),
  orderCents: z.number().int().positive().max(10_000_000), // max R$ 100.000
});

export async function POST(req: NextRequest) {
  // Require authentication, prevent unauthenticated coupon enumeration
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1], true)).uid; // checkRevoked
  } catch {
    return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 });
  }

  // Por IP e por conta, e um teto geral: impede adivinhar códigos de cupom
  // em massa (contas anônimas são de graça, então só o IP não segura).
  const ip = getClientIp(req);
  if (!await rateLimit(`coupon:${ip}`, 20, 10 * 60 * 1000)
    || !await rateLimit(`coupon:uid:${uid}`, 10, 10 * 60 * 1000)
    || !await rateLimit('coupon:global', 300, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
    }

    const { code, orderCents } = parsed.data;

    const snap = await adminDb.collection('coupons').doc(code.toUpperCase()).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Cupom não encontrado' }, { status: 404 });
    }

    const coupon = snap.data() as Coupon;
    const result = validateCoupon(coupon, orderCents);
    if (!result.valid) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ discountCents: result.discountCents });
  } catch {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }
}
