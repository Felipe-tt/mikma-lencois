export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth, adminStorage } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { safeJson, tooManyRequests } from '@/lib/security';

async function getSeller(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7), true); // checkRevoked
    if (decoded.role !== 'seller' && decoded.role !== 'admin') return null;
    return decoded;
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snap = await adminDb.collection('products').doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const data = snap.data()!;
  // Produto inativo/rascunho não é público — só quem tem o link do painel (autenticado) pode ver.
  if (data.active !== true) {
    const seller = await getSeller(req);
    if (!seller) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }
  return NextResponse.json({ id: snap.id, ...data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const seller = await getSeller(req);
  if (!seller) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const key = `products:update:${seller.uid}`;
  if (!rateLimit(key, 60, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const { id } = await params;
  const body = await safeJson(req, 32768);
  if (!body.ok) return body.response;

  const allowed = z.object({
    name: z.string().min(2).max(200).optional(),
    description: z.string().min(10).max(5000).optional(),
    price: z.number().int().positive().max(100_000_00).optional(),
    images: z.array(z.string().url().max(500)).max(20).optional(),
    category: z.string().max(100).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    active: z.boolean().optional(),
  }).safeParse(body.data);

  if (!allowed.success) return NextResponse.json({ error: allowed.error.flatten() }, { status: 400 });

  await adminDb.collection('products').doc(id).update({
    ...allowed.data,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const seller = await getSeller(req);
  if (!seller) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const key = `products:delete:${seller.uid}`;
  if (!rateLimit(key, 20, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const { id } = await params;

  const productRef = adminDb.collection('products').doc(id);
  const snap = await productRef.get();
  if (!snap.exists) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });

  const productData = snap.data();

  // Apaga imagens do Storage (evita arquivos órfãos acumulando custo)
  const images: string[] = productData?.images ?? [];
  await Promise.allSettled(
    images.map(url => {
      try {
        const m = url.match(/\/o\/(.+?)\?/);
        if (!m) return Promise.resolve();
        const storagePath = decodeURIComponent(m[1]);
        return adminStorage.bucket().file(storagePath).delete({ ignoreNotFound: true });
      } catch { return Promise.resolve(); }
    })
  );

  // Apaga o estoque vinculado a este produto (cada variante é um doc em inventory)
  const invSnap = await adminDb.collection('inventory').where('productId', '==', id).get();
  const batch = adminDb.batch();
  invSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(productRef);
  await batch.commit();

  return NextResponse.json({ ok: true });
}
