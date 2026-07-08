import { adminDb } from '@/lib/firebase/admin';
import type { Product } from '@/types';
import { serialize } from '@/lib/utils/serialize';
import { SizeGuideCalculator } from '@/components/product/SizeGuideCalculator';

export const dynamic = 'force-dynamic';

async function getActiveProducts(): Promise<Product[]> {
  const snap = await adminDb.collection('products').where('active', '==', true).limit(200).get();
  return snap.docs.map(d => serialize<Product>({ id: d.id, ...d.data() }));
}

export const metadata = {
  title: 'Guia de tamanhos: qual lençol comprar | Mikma Lençóis',
  description: 'Não sabe se seu colchão é Solteiro, Casal, Queen ou King? Informe as medidas e a gente te mostra o tamanho certo, sem achismo.',
};

export default async function GuiaDeTamanhosPage() {
  const products = await getActiveProducts();

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
      <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-[#9C8878] mb-4 text-center">
        Guia de tamanhos
      </p>
      <h1 className="font-display font-normal text-[#1E1208] leading-[1.05] tracking-[-0.02em] mb-4 text-[clamp(2rem,6vw,3.2rem)] text-center">
        Qual lençol é o certo pro seu colchão?
      </h1>
      <p className="text-[15px] text-[#705A48] max-w-[52ch] mx-auto text-center leading-relaxed mb-10">
        Meça a largura e o comprimento do colchão (não da cama, do colchão em si) e a gente te diz exatamente qual tamanho comprar, sem chute.
      </p>

      <SizeGuideCalculator products={products} />
    </div>
  );
}
