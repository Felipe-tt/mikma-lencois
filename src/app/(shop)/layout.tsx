import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PageTransition } from '@/components/ui/PageTransition';
import { getSettings } from '@/lib/settings';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
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
        sloganLine1={s.ctaSloganLine1 || `Feito em ${s.storeCity?.split(',')[0] || 'Blumenau'}.`}
        sloganLine2={s.ctaSloganLine2 || 'Dorme bem.'}
      />
    </div>
  );
}
