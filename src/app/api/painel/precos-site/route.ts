import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { getSettings } from '@/lib/settings';
import { sitePriceCents } from '@/lib/sitePrice';

/**
 * POST /api/painel/precos-site
 *
 * Refaz o preço do site de todos os produtos com o acréscimo salvo nas
 * configurações: price = storePrice (loja física) + acréscimo. Produto
 * antigo sem storePrice usa o preço atual como o da loja. Carrinhos
 * abertos passam a mostrar o preço novo (o checkout já cobra o do produto).
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;
  if (!await rateLimit(`precos-site:${auth.decoded.uid}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um minuto.' }, { status: 429 });
  }

  // Lê direto do banco: o painel acabou de salvar o acréscimo.
  const snap = await adminDb.collection('settings').doc('store').get();
  const s = { ...(await getSettings()), ...(snap.data() ?? {}) };
  const rule = { pct: Number(s.sitePriceMarkupPct) || 0, rounding: s.sitePriceRounding };

  const products = await adminDb.collection('products').get();
  const newPrice = new Map<string, number>();
  let batch = adminDb.batch();
  let pending = 0;
  let changed = 0;
  for (const d of products.docs) {
    const data = d.data();
    const store = typeof data.storePrice === 'number' && data.storePrice > 0 ? data.storePrice : Number(data.price) || 0;
    if (store <= 0) continue;
    const price = sitePriceCents(store, rule);
    newPrice.set(d.id, price);
    if (price === data.price && data.storePrice === store) continue;
    batch.update(d.ref, { storePrice: store, price, updatedAt: FieldValue.serverTimestamp() });
    changed++;
    if (++pending === 400) { await batch.commit(); batch = adminDb.batch(); pending = 0; }
  }
  if (pending) await batch.commit();

  // Carrinhos guardam o preço de quando o item entrou.
  let carts = 0;
  if (changed) {
    const cartSnap = await adminDb.collection('carts').get();
    batch = adminDb.batch(); pending = 0;
    for (const c of cartSnap.docs) {
      const items = (c.data().items ?? []) as Array<{ productId?: string; unitPrice?: number }>;
      let touched = false;
      const next = items.map(i => {
        const p = i.productId ? newPrice.get(i.productId) : undefined;
        if (p && p !== i.unitPrice) { touched = true; return { ...i, unitPrice: p }; }
        return i;
      });
      if (!touched) continue;
      batch.update(c.ref, { items: next });
      carts++;
      if (++pending === 400) { await batch.commit(); batch = adminDb.batch(); pending = 0; }
    }
    if (pending) await batch.commit();
  }

  revalidatePath('/', 'layout');
  revalidateTag('products', { expire: 0 });
  return NextResponse.json({ ok: true, products: changed, carts });
}
