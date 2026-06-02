import { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://mikmalencois.com.br';

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${base}/produtos`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/sobre`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/privacidade`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/termos`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Só tenta buscar produtos se as credenciais estiverem disponíveis
  const hasCredentials =
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY;

  if (!hasCredentials) return staticPages;

  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    const snap = await adminDb
      .collection('products')
      .where('active', '==', true)
      .select('createdAt')
      .get();

    const productPages: MetadataRoute.Sitemap = snap.docs.map((doc) => ({
      url: `${base}/produtos/${doc.id}`,
      lastModified: doc.data().createdAt?.toDate() ?? new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

    return [...staticPages, ...productPages];
  } catch {
    return staticPages;
  }
}
