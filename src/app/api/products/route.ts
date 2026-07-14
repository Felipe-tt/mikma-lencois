export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { safeJson, tooManyRequests } from '@/lib/security';

const VariantSchema = z.object({
  id: z.string().max(64),
  size: z.enum(['solteiro', 'casal', 'queen', 'king', 'berco', 'unico']),
  color: z.string().max(64).optional().default(''),
  fabric: z.string().max(64).optional().default(''),
});

const ProductSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().min(10).max(5000),
  price: z.number().int().positive().max(100_000_00), // max R$100.000
  images: z.array(z.string().url().max(500)).min(1).max(20),
  category: z.string().min(1).max(100),
  tags: z.array(z.string().max(50)).max(20).default([]),
  variants: z.array(VariantSchema).min(1).max(50),
  active: z.boolean().default(true),
});

async function getSeller(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7), true); // checkRevoked
    if (decoded.role !== 'seller' && decoded.role !== 'admin') return null;
    return decoded;
  } catch { return null; }
}

export async function GET() {
  const snap = await adminDb.collection('products').where('active', '==', true).orderBy('createdAt', 'desc').get();
  const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ products }, {
    headers: {
      // CDN e browser cacheiam 5min; pode revalidar em bg por até 1h
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}

export async function POST(req: NextRequest) {
  const seller = await getSeller(req);
  if (!seller) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  // Rate limit: 30 produtos/hora por vendedor
  const key = `products:create:${seller.uid}`;
  if (!rateLimit(key, 30, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const body = await safeJson(req, 32768); // 32KB max
  if (!body.ok) return body.response;

  const parse = ProductSchema.safeParse(body.data);
  if (!parse.success) return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });

  const ref = adminDb.collection('products').doc();
  await ref.set({
    ...parse.data,
    sellerId: seller.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const batch = adminDb.batch();
  for (const variant of parse.data.variants) {
    const sku = `${ref.id}_${variant.id}`;
    batch.set(adminDb.collection('inventory').doc(sku), {
      productId: ref.id, variant, quantity: 0, reserved: 0,
      lowStockThreshold: 5, history: [], updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  return NextResponse.json({ id: ref.id }, { status: 201 });
}
