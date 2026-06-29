export const dynamic = 'force-dynamic';
// maxDuration reduzido: sem download/upload de imagens, só escrita no Firestore
export const maxDuration = 20;

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth, safeJson, tooManyRequests } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { CATEGORIES, SIZES, FABRICS } from '@/lib/productOptions';

// Agora recebe URLs já hospedadas no Firebase Storage
// (o browser fez o upload direto via URL assinada)
const ImportItemSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(5000).optional().default(''),
  priceBRL: z.number().positive().max(100_000),
  category: z.enum(CATEGORIES),
  size: z.enum(SIZES),
  fabric: z.enum(FABRICS),
  colorHex: z.string().max(20).optional().default(''),
  colorName: z.string().max(64).optional().default(''),
  weightKg: z.number().positive().max(50),
  // URLs permanentes do Firebase Storage — já hospedadas pelo cliente
  imageUrls: z
    .array(
      z.string()
        .url()
        .max(2000)
        .refine(
          (u) => u.startsWith('https://firebasestorage.googleapis.com/'),
          'Apenas URLs do Firebase Storage são aceitas'
        )
    )
    .min(1)
    .max(10),
  active: z.boolean().optional().default(true),
});

const ImportSchema = z.object({
  items: z.array(ImportItemSchema).min(1).max(25),
});

function makeVariantId(size: string, fabric: string) {
  return `${size}_${fabric}`.toLowerCase().replace(/\s+/g, '_');
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const key = `whatsapp-catalog:import:${auth.decoded.uid}`;
  if (!rateLimit(key, 10, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const body = await safeJson(req, 131072);
  if (!body.ok) return body.response;

  const parsed = ImportSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Usa um batch para criar todos os produtos de uma vez — menos round-trips
  const batch = adminDb.batch();
  const productIds: string[] = [];

  for (const item of parsed.data.items) {
    const variant = {
      id: makeVariantId(item.size, item.fabric),
      size: item.size,
      fabric: item.fabric,
      color: item.colorHex,
      colorName: item.colorName || item.colorHex,
    };

    const ref = adminDb.collection('products').doc();
    batch.set(ref, {
      name: item.name,
      description: item.description,
      price: Math.round(item.priceBRL * 100),
      weightKg: item.weightKg,
      images: item.imageUrls,
      category: item.category,
      tags: [],
      variants: [variant],
      active: item.active,
      sellerId: auth.decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const invRef = adminDb
      .collection('inventory')
      .doc(`${ref.id}_${variant.id}`);
    batch.set(invRef, {
      productId: ref.id,
      variant,
      quantity: 0,
      reserved: 0,
      lowStockThreshold: 5,
      history: [],
      updatedAt: FieldValue.serverTimestamp(),
    });

    productIds.push(ref.id);
  }

  await batch.commit();

  return NextResponse.json({ created: productIds.length, productIds });
}
