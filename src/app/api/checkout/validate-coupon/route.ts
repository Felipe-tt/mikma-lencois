export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { Coupon } from '@/types';
import { z } from 'zod';
import { rateLimit } from '@/lib/rateLimit';

const schema = z.object({
  code: z.string().min(1).max(32).regex(/^[A-Z0-9_-]+$/i),
  orderCents: z.number().int().positive().max(10_000_000), // max R$ 100.000
});

export async function POST(req: NextRequest) {
  // Require authentication — prevent unauthenticated coupon enumeration
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  try {
    await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1], true); // checkRevoked
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  // Rate limit: 20 coupon checks per IP per 10 minutes
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(`coupon:${ip}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 });
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
    const now = new Date();

    if (!coupon.active) return NextResponse.json({ error: 'Cupom inativo' }, { status: 400 });
    if (new Date(coupon.expiresAt) < now) return NextResponse.json({ error: 'Cupom expirado' }, { status: 400 });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: 'Cupom esgotado' }, { status: 400 });
    }
    if (coupon.minOrderCents && orderCents < coupon.minOrderCents) {
      return NextResponse.json(
        { error: `Pedido mínimo de R$ ${(coupon.minOrderCents / 100).toFixed(2)}` },
        { status: 400 }
      );
    }

    const discountCents =
      coupon.type === 'percent'
        ? Math.round((orderCents * coupon.value) / 100)
        : coupon.value;

    return NextResponse.json({ discountCents });
  } catch {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }
}
