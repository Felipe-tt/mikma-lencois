export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import type { CartItem, Order, Address } from '@/types';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, safeJson, extractBearer, tooManyRequests } from '@/lib/security';

const addressSchema = z.object({
  cep: z.string().min(8).max(9),
  street: z.string().min(1).max(200),
  number: z.string().min(1).max(20),
  complement: z.string().max(100).optional(),
  neighborhood: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  state: z.string().length(2),
});

const schema = z.object({
  couponCode: z.string().max(32).regex(/^[A-Z0-9_-]+$/i).optional(),
  address: addressSchema,
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  const bearerResult = extractBearer(req);
  if ('response' in bearerResult) return bearerResult.response;

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearerResult.token, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  // Dual rate limit: por IP e por usuário
  const ipKey = `orders:${ip}`;
  const uidKey = `orders:uid:${uid}`;
  if (!rateLimit(ipKey, 20, 60 * 60 * 1000) || !rateLimit(uidKey, 10, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(uidKey));
  }

  const body = await safeJson(req, 4096);
  if (!body.ok) return body.response;

  const parsed = schema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  const { couponCode, address } = parsed.data as { couponCode?: string; address: Address };

  try {
    const cartSnap = await adminDb.collection('carts').doc(uid).get();
    if (!cartSnap.exists) return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });
    const items: CartItem[] = cartSnap.data()?.items ?? [];
    if (items.length === 0) return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });

    const productIds = Array.from(new Set(items.map(i => i.productId)));
    const productDocs = await Promise.all(productIds.map(id => adminDb.collection('products').doc(id).get()));
    const priceMap: Record<string, number> = {};
    for (const snap of productDocs) {
      if (snap.exists) priceMap[snap.id] = snap.data()!.price as number;
    }
    const verifiedItems = items.map(i => ({ ...i, unitPrice: priceMap[i.productId] ?? i.unitPrice }));
    const subtotalCents = verifiedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    let discountCents = 0;
    if (couponCode) {
      const couponRef = adminDb.collection('coupons').doc(couponCode.toUpperCase());
      try {
        discountCents = await adminDb.runTransaction(async tx => {
          const couponSnap = await tx.get(couponRef);
          if (!couponSnap.exists) return 0;
          const coupon = couponSnap.data()!;
          if (!coupon.active || new Date(coupon.expiresAt) < new Date()) return 0;
          if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return 0;
          const discount = coupon.type === 'percent'
            ? Math.round((subtotalCents * coupon.value) / 100)
            : (coupon.value as number);
          tx.update(couponRef, { usedCount: FieldValue.increment(1) });
          return discount;
        });
      } catch { discountCents = 0; }
    }

    const totalCents = Math.max(0, subtotalCents - discountCents);
    const { randomBytes } = await import('crypto');
    const orderId = `ord_${randomBytes(8).toString('hex')}`;
    const orderRef = adminDb.collection('orders').doc(orderId);
    const order: Omit<Order, 'id'> = {
      userId: uid,
      items: verifiedItems,
      status: 'pending_payment',
      payment: { method: 'pix', txId: '' },
      delivery: { carrier: null },
      address,
      totalCents,
      discountCents,
      couponCode: couponCode?.toUpperCase(),
      createdAt: new Date().toISOString(),
    };
    await orderRef.set(order);
    // Salva só campos validados no perfil — evita sobrescrever campos arbitrários
    const safeAddress = {
      cep: address.cep,
      street: address.street,
      number: address.number,
      complement: address.complement ?? '',
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
    };
    await adminDb.collection('users').doc(uid).update({ address: safeAddress });

    return NextResponse.json({ orderId: orderRef.id, totalCents, discountCents });
  } catch (err) {
    console.error('create-order error', err);
    return NextResponse.json({ error: 'Erro ao criar pedido' }, { status: 500 });
  }
}
