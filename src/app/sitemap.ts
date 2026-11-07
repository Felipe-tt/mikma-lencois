import { MetadataRoute } from 'next';
import { cacheLife, cacheTag } from 'next/cache';
import { adminDb } from '@/lib/firebase/admin';

const BASE = 'https://mikma.com.br';

// Em cache por 1h (e limpo ao salvar um produto): sem isso o sitemap era
// gerado uma vez no build e produto novo só aparecia pro Google no deploy.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheTag('products');

  // Páginas fixas sem data: "agora" a cada geração é data falsa, e o Google
  // passa a ignorar o lastmod do sitemap inteiro (inclusive o dos produtos,
  // que é real). A home e o catálogo mudam junto com os produtos: usam a data
  // do produto salvo mais recentemente.
  const fixed = (path: string, priority: number, changeFrequency: 'daily' | 'monthly' | 'yearly') =>
    ({ url: `${BASE}${path}`, changeFrequency, priority });
  const statics: MetadataRoute.Sitemap = [
    fixed('', 1, 'daily'),
    fixed('/produtos', 0.9, 'daily'),
    fixed('/sobre', 0.5, 'monthly'),
    fixed('/guia-de-tamanhos', 0.6, 'monthly'),
    fixed('/trocas-e-devolucoes', 0.3, 'yearly'),
    fixed('/privacidade', 0.2, 'yearly'),
    fixed('/termos', 0.2, 'yearly'),
    fixed('/politica-de-cookies', 0.2, 'yearly'),
  ];

  // Product pages
  try {
    const snap = await adminDb
      .collection('products')
      .where('active', '==', true)
      .select('updatedAt')
      .get();

    const products: MetadataRoute.Sitemap = snap.docs.map(d => ({
      url: `${BASE}/produtos/${d.id}`,
      ...(d.data().updatedAt?.toDate ? { lastModified: d.data().updatedAt.toDate() as Date } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

    // Home e catálogo: mudaram quando o último produto mudou.
    const newest = products.reduce<Date | undefined>((max, p) => {
      const d = p.lastModified instanceof Date ? p.lastModified : undefined;
      return d && (!max || d > max) ? d : max;
    }, undefined);
    if (newest) for (const page of statics.slice(0, 2)) page.lastModified = newest;

    cacheLife('hours');
    return [...statics, ...products];
  } catch {
    cacheLife({ stale: 30, revalidate: 60, expire: 300 });
    return statics;
  }
}
