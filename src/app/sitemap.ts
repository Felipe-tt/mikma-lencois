import { MetadataRoute } from 'next';
import { adminDb } from '@/lib/firebase/admin';

const BASE = 'https://mikma.com.br';

// Sem isso o sitemap era gerado uma vez no build (rota estática) e produto
// novo só aparecia pro Google no próximo deploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static pages
  const statics: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/produtos`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/sobre`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/guia-de-tamanhos`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/trocas-e-devolucoes`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/privacidade`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/termos`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/politica-de-cookies`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
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
      lastModified: d.data().updatedAt?.toDate?.() ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

    return [...statics, ...products];
  } catch {
    return statics;
  }
}
