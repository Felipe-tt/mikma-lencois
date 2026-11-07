import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CookieBanner } from '@/components/layout/CookieBanner';
import { PageTransition } from '@/components/ui/PageTransition';
import { MaintenanceGate } from '@/components/layout/MaintenanceGate';
import { getStoreSettings } from '@/lib/settings';
import { storeIdentity } from '@/lib/legal';
import { JsonLd } from '@/components/seo/JsonLd';
import { WhatsAppProvider, WhatsAppFloat } from '@/components/contact/WhatsApp';
import { storeWhatsapp } from '@/lib/whatsapp';
import { pauseNotice } from '@/lib/salesPause';

// Prerender parcial (cacheComponents): o layout sai no HTML estático com as
// configurações em cache (getStoreSettings). A checagem de manutenção "de
// verdade" acontece no proxy, mas uma página servida do cache da CDN não
// passa por ele: o <MaintenanceGate /> cobre esse caso no client, via fetch
// dinâmico, e redireciona pra /manutencao se necessário.

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const s = await getStoreSettings();
  const identity = storeIdentity(s);
  const siteUrl = 'https://mikma.com.br';
  // Endereço, telefone e perfis da loja, do painel. Completa a loja do layout
  // raiz (mesmo @id) e liga o site ao perfil da empresa no Google, para ele
  // saber que a página oficial é a home e não, por exemplo, os Termos.
  const storeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': `${siteUrl}/#loja`,
    name: s.storeName || 'Mikma Lençóis',
    url: `${siteUrl}/`,
    ...(s.storePhone && { telephone: s.storePhone }),
    ...(s.storeEmail && { email: s.storeEmail }),
    address: {
      '@type': 'PostalAddress',
      ...(s.storeAddress && { streetAddress: [s.storeAddress, s.storeNumber].filter(Boolean).join(', ') }),
      addressLocality: s.storeCity?.split(',')[0].trim() || 'Blumenau',
      addressRegion: s.storeState || 'SC',
      ...(s.storeCep && { postalCode: s.storeCep }),
      addressCountry: 'BR',
    },
    ...(s.instagramUrl && { sameAs: [s.instagramUrl] }),
  };
  return (
    <WhatsAppProvider href={storeWhatsapp(s)} hours={s.businessHours} timeZone={s.businessHoursTimezone}>
    <div className="flex min-h-screen flex-col">
      <JsonLd data={storeJsonLd} />
      <MaintenanceGate />
      {/* Atalho de teclado: primeiro Tab da página pula o menu */}
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-ink focus:text-paper focus:px-5 focus:py-2.5 focus:text-[13px] focus:font-medium">
        Pular para o conteúdo
      </a>
      <Header topbarText={pauseNotice(s) ?? s.topbarText} freeShippingThresholdCents={s.freeShippingThresholdCents} />
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
        salesPaused={!!pauseNotice(s)}
      />
      <WhatsAppFloat />
      <CookieBanner />
    </div>
    </WhatsAppProvider>
  );
}
