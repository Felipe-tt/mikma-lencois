import { adminDb } from '@/lib/firebase/admin';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import type { Product, InventoryItem } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { VariantSelector } from '@/components/product/VariantSelector';
import type { Metadata } from 'next';

interface Props {
  params: { slug: string };
}

async function getProduct(id: string): Promise<Product | null> {
  const snap = await adminDb.collection('products').doc(id).get();
  if (!snap.exists || !snap.data()?.active) return null;
  return { id: snap.id, ...snap.data() } as Product;
}

async function getInventory(productId: string): Promise<InventoryItem[]> {
  const snap = await adminDb
    .collection('inventory')
    .where('productId', '==', productId)
    .get();
  return snap.docs.map((d) => ({ sku: d.id, ...d.data() } as InventoryItem));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct(params.slug);
  if (!product) return { title: 'Produto não encontrado' };
  return {
    title: product.name,
    description: product.description.slice(0, 160),
    openGraph: {
      images: product.images[0] ? [{ url: product.images[0] }] : [],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const [product, inventory] = await Promise.all([
    getProduct(params.slug),
    getInventory(params.slug),
  ]);

  if (!product) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Images */}
        <div className="space-y-3">
          {product.images.length > 0 ? (
            <>
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
                <Image
                  src={product.images[0]}
                  alt={product.name}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
              {product.images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {product.images.slice(1).map((img, i) => (
                    <div
                      key={i}
                      className="relative aspect-square overflow-hidden rounded-md bg-gray-100"
                    >
                      <Image
                        src={img}
                        alt={`${product.name} ${i + 2}`}
                        fill
                        sizes="25vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-gray-100">
              <span className="text-sm text-gray-400">Sem imagem</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{product.name}</h1>

          <p className="mt-3 text-2xl font-bold text-gray-900">
            {formatCurrency(product.price)}
          </p>

          {product.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {product.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <p className="mt-4 text-sm leading-relaxed text-gray-600">
            {product.description}
          </p>

          <div className="mt-6">
            <VariantSelector
              product={product}
              inventory={inventory}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
