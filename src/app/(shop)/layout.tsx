import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CookieBanner } from '@/components/layout/CookieBanner';
import { PageTransition } from '@/components/ui/PageTransition';
import { MaintenanceGate } from '@/components/layout/MaintenanceGate';
import { getStoreSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { JsonLd } from '@/components/seo/JsonLd';

// Prerender parcial (cacheComponents): o layout sai no HTML estático com as
// configurações em cache (getStoreSettings). A checagem de manutenção "de
// verdade" acontece no proxy, mas uma página servida do cache da CDN não
// passa por ele: o <MaintenanceGate /> cobre esse caso no client, via fetch
// dinâmico, e redireciona pra /manutencao se necessário.

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const s = await getStoreSettings();
  const identity = storeIdentity(s);
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
      {/* Atalho de teclado: primeiro Tab da página pula o menu */}
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-ink focus:text-paper focus:px-5 focus:py-2.5 focus:text-[13px] focus:font-medium">
        Pular para o conteúdo
      </a>
      <Header topbarText={s.topbarText} freeShippingThresholdCents={s.freeShippingThresholdCents} />
      <main id="conteudo" tabIndex={-1} className="flex-1 focus:outline-none">
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
        cnpj={identity.cnpj}
        address={identity.address}
        businessHours={s.businessHours}
        businessHoursTimezone={s.businessHoursTimezone}
      />
      <CookieBanner />
    </div>
  );
}
