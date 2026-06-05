export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import type { CartItem, Order, Address } from '@/types';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';

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
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }
    const { couponCode, address } = parsed.data as { couponCode?: string; address: Address };

    // Load cart server-side
    const cartSnap = await adminDb.collection('carts').doc(uid).get();
    if (!cartSnap.exists) return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });
    const items: CartItem[] = cartSnap.data()?.items ?? [];
    if (items.length === 0) return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });

    // Load prices server-side — never trust client values
    const productIds = Array.from(new Set(items.map(i => i.productId)));
    const productDocs = await Promise.all(
      productIds.map(id => adminDb.collection('products').doc(id).get())
    );
    const priceMap: Record<string, number> = {};
    for (const snap of productDocs) {
      if (snap.exists) priceMap[snap.id] = snap.data()!.price as number;
    }
    const verifiedItems = items.map(i => ({ ...i, unitPrice: priceMap[i.productId] ?? i.unitPrice }));
    const subtotalCents = verifiedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    let discountCents = 0;

    // Apply coupon inside a Firestore transaction to prevent race conditions
    if (couponCode) {
      const couponRef = adminDb.collection('coupons').doc(couponCode.toUpperCase());
      try {
        discountCents = await adminDb.runTransaction(async tx => {
          const couponSnap = await tx.get(couponRef);
          if (!couponSnap.exists) return 0;
          const coupon = couponSnap.data()!;

          const now = new Date();
          if (!coupon.active || new Date(coupon.expiresAt) < now) return 0;
          // Atomically check maxUses inside transaction
          if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return 0;

          const discount = coupon.type === 'percent'
            ? Math.round((subtotalCents * coupon.value) / 100)
            : (coupon.value as number);

          tx.update(couponRef, { usedCount: FieldValue.increment(1) });
          return discount;
        });
      } catch {
        discountCents = 0; // don't block order on coupon error
      }
    }

    const totalCents = Math.max(0, subtotalCents - discountCents);

    const orderRef = adminDb.collection('orders').doc();
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

    // Save address for future checkouts
    await adminDb.collection('users').doc(uid).update({ address });

    return NextResponse.json({ orderId: orderRef.id, totalCents, discountCents });
  } catch (err) {
    console.error('create-order error', err);
    return NextResponse.json({ error: 'Erro ao criar pedido' }, { status: 500 });
  }
}
