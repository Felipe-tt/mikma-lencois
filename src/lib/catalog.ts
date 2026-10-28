import { cacheLife, cacheTag } from 'next/cache';
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
export async function getCatalog(): Promise<Product[]> {
  'use cache';
  cacheTag('products');
  try {
    const snap = await adminDb.collection('products').where('active', '==', true)
      .orderBy('createdAt', 'desc').limit(MAX_CATALOG).get();
    cacheLife({ stale: 300, revalidate: 600, expire: 86_400 });
    return snap.docs.map(d => serialize<Product>({ id: d.id, ...d.data() }));
  } catch (err) {
    // Falha de leitura (ou build sem acesso ao banco): lista vazia por
    // pouco tempo, para tentar de novo logo em vez de guardar por 10 min.
    console.error('[catalog] falha ao ler o catálogo', err);
    cacheLife({ stale: 30, revalidate: 60, expire: 300 });
    return [];
  }
}
