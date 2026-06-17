import { MetadataRoute } from 'next';
import { adminDb } from '@/lib/firebase/admin';

const BASE = 'https://mikma.com.br';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static pages
  const statics: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/produtos`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/sobre`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/entrar`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/cadastro`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
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
