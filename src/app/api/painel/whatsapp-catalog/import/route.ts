export const dynamic = 'force-dynamic';
export const maxDuration = 90;

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'node:crypto';
import { verifyAuth, safeJson, tooManyRequests } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { CATEGORIES, SIZES, FABRICS } from '@/lib/productOptions';

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
  imageUrls: z.array(z.string().url().max(2000)).min(1).max(10),
  active: z.boolean().optional().default(true),
});

const ImportSchema = z.object({
  items: z.array(ImportItemSchema).min(1).max(25),
});

function makeVariantId(size: string, fabric: string) {
  return `${size}_${fabric}`.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Baixa a imagem (CDN do WhatsApp, geralmente com link assinado/temporário)
 * e sobe pro Firebase Storage, pra ficar com uma URL permanente — igual ao
 * que o painel faz ao cadastrar um produto manualmente.
 */
async function rehostImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return null; // máx 8MB

    const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
    const token = crypto.randomUUID();
    const now = new Date();
    const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const destination = `products/${folder}/whatsapp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;

    const bucket = adminStorage.bucket();
    await bucket.file(destination).save(buf, {
      metadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  // Importação real é uma operação "pesada" (baixa e sobe imagens) — limite
  // generoso mas protege contra uso indevido.
  const key = `whatsapp-catalog:import:${auth.decoded.uid}`;
  if (!rateLimit(key, 10, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const body = await safeJson(req, 131072); // 128KB — várias URLs de imagem por item
  if (!body.ok) return body.response;

  const parsed = ImportSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const results: Array<{ ok: true; productId: string } | { ok: false; reason: string }> = [];

  for (const item of parsed.data.items) {
    const imageUrls: string[] = [];
    for (const url of item.imageUrls) {
      const hosted = await rehostImage(url);
      if (hosted) imageUrls.push(hosted);
    }

    if (imageUrls.length === 0) {
      results.push({ ok: false, reason: 'Não foi possível baixar nenhuma imagem desse produto (o link do WhatsApp pode ter expirado — busque o catálogo de novo).' });
      continue;
    }

    const variant = {
      id: makeVariantId(item.size, item.fabric),
      size: item.size,
      fabric: item.fabric,
      color: item.colorHex,
      colorName: item.colorName || item.colorHex,
    };

    const ref = adminDb.collection('products').doc();
    await ref.set({
      name: item.name,
      description: item.description,
      price: Math.round(item.priceBRL * 100),
      weightKg: item.weightKg,
      images: imageUrls,
      category: item.category,
      tags: [],
      variants: [variant],
      active: item.active,
      sellerId: auth.decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection('inventory').doc(`${ref.id}_${variant.id}`).set({
      productId: ref.id,
      variant,
      quantity: 0,
      reserved: 0,
      lowStockThreshold: 5,
      history: [],
      updatedAt: FieldValue.serverTimestamp(),
    });

    results.push({ ok: true, productId: ref.id });
  }

  const created = results.filter((r) => r.ok).length;
  return NextResponse.json({ created, productIds: results.filter((r): r is { ok: true; productId: string } => r.ok).map((r) => r.productId), results });
}
