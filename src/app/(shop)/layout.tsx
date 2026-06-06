import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { getSettings } from '@/lib/settings';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="flex min-h-screen flex-col">
      <Header topbarText={s.topbarText} />
      <main className="flex-1">{children}</main>
      <Footer
        storeName={s.storeName}
        storeCity={s.storeCity}
        storePhone={s.storePhone}
        storeEmail={s.storeEmail}
      />
    </div>
  );
}
