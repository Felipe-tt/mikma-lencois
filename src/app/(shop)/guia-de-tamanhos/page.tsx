import type { Metadata } from 'next';
import { adminDb } from '@/lib/firebase/admin';
import { shareMeta } from '@/lib/seo';
import type { Product } from '@/types';
import { serialize } from '@/lib/utils/serialize';
import { SizeGuideCalculator } from '@/components/product/SizeGuideCalculator';
import { getSettings } from '@/lib/settings';
import { parseMattressWidthsFromBedSizeTable } from '@/lib/mattressSizeMatch';

export const dynamic = 'force-dynamic';

async function getActiveProducts(): Promise<Product[]> {
  const snap = await adminDb.collection('products').where('active', '==', true).limit(200).get();
  return snap.docs.map(d => serialize<Product>({ id: d.id, ...d.data() }));
}

const GUIA_DESCRIPTION = 'Não sabe se seu colchão é Solteiro, Casal, Queen ou King? Informe as medidas e a gente te mostra o tamanho certo, sem achismo.';

// Sem o "| Mikma Lençóis" no título: o template do layout já adiciona
// (antes saía "… | Mikma Lençóis | Mikma Lençóis").
export const metadata: Metadata = {
  title: 'Guia de tamanhos: qual lençol comprar',
  description: GUIA_DESCRIPTION,
  alternates: { canonical: '/guia-de-tamanhos' },
  ...shareMeta({ title: 'Guia de tamanhos', description: GUIA_DESCRIPTION, path: '/guia-de-tamanhos' }),
};

export default async function GuiaDeTamanhosPage() {
  const [products, settings] = await Promise.all([getActiveProducts(), getSettings()]);
  const widths = parseMattressWidthsFromBedSizeTable(settings.bedSizeRows);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
      <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-faint mb-4 text-center">
        Guia de tamanhos
      </p>
      <h1 className="font-display font-normal text-ink leading-[1.05] tracking-[-0.02em] mb-4 text-[clamp(2rem,6vw,3.2rem)] text-center">
        Qual lençol é o certo pro seu colchão?
      </h1>
      <p className="text-[15px] text-mid max-w-[52ch] mx-auto text-center leading-relaxed mb-10">
        Meça a largura do colchão (não da cama) e a gente te diz exatamente qual tamanho comprar, sem chute.
      </p>

      <SizeGuideCalculator products={products} widths={widths} />
    </div>
  );
}
