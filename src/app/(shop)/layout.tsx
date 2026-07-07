import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PageTransition } from '@/components/ui/PageTransition';
import { MaintenanceGate } from '@/components/layout/MaintenanceGate';
import { getSettings } from '@/lib/settings';

// Sem force-dynamic: páginas públicas usam ISR normalmente.
// A checagem de manutenção "de verdade" acontece no middleware (Edge), sem
// Cloud Run — MAS isso só roda em cache-miss. Em cache-hit na CDN do
// Firebase Hosting (ex.: homepage com revalidate=900), a resposta cacheada
// é servida direto e o middleware nunca executa. O <MaintenanceGate />
// cobre esse caso: confere no client, via fetch dinâmico, e redireciona
// pra /manutencao se necessário.

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="flex min-h-screen flex-col">
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
