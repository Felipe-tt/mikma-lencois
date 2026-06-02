import { adminDb } from '@/lib/firebase/admin';
import { ProductCard } from '@/components/product/ProductCard';
import type { Product } from '@/types';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getFeaturedProducts(): Promise<Product[]> {
  try {
    const snap = await adminDb
      .collection('products')
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(8)
      .get();

    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Product));
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const products = await getFeaturedProducts();

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            Lençóis com qualidade
            <br />
            <span className="text-blue-600">direto de Blumenau</span>
          </h1>
          <p className="mt-4 max-xl text-lg text-gray-500">
            Entrega local em até 1h ou para todo o Brasil com rastreamento em tempo real.
          </p>
          <div className="mt-8 flex gap-4">
            <Link
              href="/produtos"
              className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              Ver produtos
            </Link>
            <Link
              href="/sobre"
              className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Sobre nós
            </Link>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-gray-900">Produtos em destaque</h2>
          <Link href="/produtos" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Ver todos →
          </Link>
        </div>

        {products.length === 0 ? (
          <p className="py-20 text-center text-gray-400">
            Nenhum produto cadastrado ainda.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* Benefits strip */}
      <section className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-0 divide-y divide-gray-200 px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6 lg:px-8">
          <div className="py-8 pr-0 sm:pr-8">
            <p className="text-sm font-semibold text-gray-900">Entrega local em 1h</p>
            <p className="mt-1 text-sm text-gray-500">
              Para endereços até 10 km de Blumenau via Uber Direct.
            </p>
          </div>
          <div className="py-8 sm:px-8">
            <p className="text-sm font-semibold text-gray-900">Frete para todo o Brasil</p>
            <p className="mt-1 text-sm text-gray-500">
              PAC, SEDEX e transportadoras via Melhor Envio com rastreio.
            </p>
          </div>
          <div className="py-8 pl-0 sm:pl-8">
            <p className="text-sm font-semibold text-gray-900">Pagamento PIX</p>
            <p className="mt-1 text-sm text-gray-500">
              QR Code gerado na hora, confirmação automática do pedido.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
