import { revalidatePath, revalidateTag } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { sitePriceCents, siteRuleFrom } from '@/lib/sitePrice';

/**
 * Refaz o preço do site de todos os produtos com a regra salva nas
 * configurações: price = storePrice (loja física) + acréscimo + taxa do PIX.
 * Produto antigo sem storePrice usa o preço atual como o da loja. Carrinhos
 * abertos passam a mostrar o preço novo (o checkout já cobra o do produto).
 */
export async function repriceSite(): Promise<{ products: number; carts: number }> {
  // Lê direto do banco: quem chama acabou de salvar a regra.
  const snap = await adminDb.collection('settings').doc('store').get();
  const rule = siteRuleFrom(snap.data());

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
  return { products: changed, carts };
}
