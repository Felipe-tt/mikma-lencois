import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PageTransition } from '@/components/ui/PageTransition';
import { MaintenanceGate } from '@/components/layout/MaintenanceGate';
import { getSettings } from '@/lib/settings';
import { JsonLd } from '@/components/seo/JsonLd';

// Sem force-dynamic: páginas públicas usam ISR normalmente.
// A checagem de manutenção "de verdade" acontece no middleware (Edge), sem
// Cloud Run, MAS isso só roda em cache-miss. Em cache-hit na CDN do
// Firebase Hosting (ex.: homepage com revalidate=900), a resposta cacheada
// é servida direto e o middleware nunca executa. O <MaintenanceGate />
// cobre esse caso: confere no client, via fetch dinâmico, e redireciona
// pra /manutencao se necessário.

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const siteUrl = 'https://mikma.com.br';
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: s.storeName || 'Mikma Lençóis',
    url: siteUrl,
    ...(s.storeCity && { address: { '@type': 'PostalAddress', addressLocality: s.storeCity, addressCountry: 'BR' } }),
    ...(s.storePhone && { telephone: s.storePhone }),
    ...(s.instagramUrl && { sameAs: [s.instagramUrl] }),
  };
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: s.storeName || 'Mikma Lençóis',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/produtos?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={orgJsonLd} />
      <JsonLd data={websiteJsonLd} />
      <MaintenanceGate />
      <Header topbarText={s.topbarText} freeShippingThresholdCents={s.freeShippingThresholdCents} />
      <main className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer
        storeName={s.storeName}
        storeCity={s.storeCity}
        storePhone={s.storePhone}
        storeEmail={s.storeEmail}
        instagramUrl={s.instagramUrl}
        whatsappUrl={s.whatsappUrl}
        tagline={s.storeSlogan}
        businessHours={s.businessHours}
        businessHoursTimezone={s.businessHoursTimezone}
      />
    </div>
  );
}
