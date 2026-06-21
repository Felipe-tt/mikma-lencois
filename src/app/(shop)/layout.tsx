import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PageTransition } from '@/components/ui/PageTransition';
import { getSettings } from '@/lib/settings';
import { checkMaintenance } from '@/lib/maintenanceCheck';

// noStore() inside checkMaintenance() forces this entire route subtree
// (this layout + every page rendered under it) to be dynamically
// rendered on every request — no ISR, no static caching, no CDN
// bypassing the Cloud Run function. This is what guarantees the
// maintenance check actually runs every time.
export const dynamic = 'force-dynamic';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  await checkMaintenance();
  const s = await getSettings();
  return (
    <div className="flex min-h-screen flex-col">
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
