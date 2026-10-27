import { unstable_cache } from 'next/cache';
import { adminDb } from '@/lib/firebase/admin';
import { serialize } from '@/lib/utils/serialize';
import type { Product } from '@/types';

/** Teto do catálogo lido de uma vez (10 páginas de 48 em /produtos). */
export const MAX_CATALOG = 480;

/**
 * Catálogo ativo inteiro, em cache no servidor por 10 min. O painel limpa
 * na hora com revalidateTag('products') ao salvar um produto (ver
 * lib/revalidateProduct.ts). Usado por /produtos e por GET /api/products.
 */
export const getCatalog = unstable_cache(async (): Promise<Product[]> => {
  const snap = await adminDb.collection('products').where('active', '==', true)
    .orderBy('createdAt', 'desc').limit(MAX_CATALOG).get();
  return snap.docs.map(d => serialize<Product>({ id: d.id, ...d.data() }));
}, ['catalogo-ativo'], { revalidate: 600, tags: ['products'] });
