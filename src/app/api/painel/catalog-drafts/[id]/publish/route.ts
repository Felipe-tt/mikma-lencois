export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuth, tooManyRequests } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { isDraftReadyToPublish, type CatalogDraftInput } from '@/lib/catalogDraft';
import { SIZES } from '@/lib/productOptions';

// Publica um rascunho como produto de verdade (mesma forma que a criação
// manual em /painel/produtos/novo): 1 produto com 1 variante. Se o
// vendedor quiser um produto com várias variantes (cores/tamanhos), essa
// junção continua sendo feita à mão no editor de produto por enquanto —
// a importação só evita redigitar o que já veio do WhatsApp.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const key = `catalog-drafts:publish:${auth.decoded.uid}`;
  if (!rateLimit(key, 30, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const { id } = await params;
  const ref = adminDb.collection('catalogDrafts').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Rascunho não encontrado' }, { status: 404 });

  const draft = snap.data() as CatalogDraftInput & { status: string };
  if (draft.status === 'published') {
    return NextResponse.json({ error: 'Este rascunho já foi publicado' }, { status: 409 });
  }

  const missing = isDraftReadyToPublish(draft);
  if (missing) return NextResponse.json({ error: missing }, { status: 400 });

  const size = draft.size as (typeof SIZES)[number];
  const priceCents = Math.round((draft.priceBRL ?? 0) * 100);

  const productRef = adminDb.collection('products').doc();
  const variantId = 'v1';

  await adminDb.runTransaction(async (tx) => {
    tx.set(productRef, {
      name: draft.name.trim(),
      description: draft.description?.trim() || draft.name.trim(),
      price: priceCents,
      weightKg: draft.weightKg,
      images: draft.images.map((img) => img.url),
      category: draft.category,
      tags: [],
      variants: [
        {
          id: variantId,
          size,
          color: draft.colorHex || '',
          fabric: draft.fabric || '',
        },
      ],
      active: true,
      sellerId: auth.decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      importedFromDraftId: id,
    });

    const sku = `${productRef.id}_${variantId}`;
    tx.set(adminDb.collection('inventory').doc(sku), {
      productId: productRef.id,
      variant: { id: variantId, size, color: draft.colorHex || '', fabric: draft.fabric || '' },
      quantity: 0,
      reserved: 0,
      lowStockThreshold: 5,
      history: [],
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.update(ref, {
      status: 'published',
      publishedProductId: productRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return NextResponse.json({ productId: productRef.id }, { status: 201 });
}
