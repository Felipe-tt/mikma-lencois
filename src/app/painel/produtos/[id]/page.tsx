'use client';

import { use, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import ProductForm from '@/components/seller/ProductForm';
import type { Product } from '@/types';

export default function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, 'products', id)).then(snap => {
      if (snap.exists()) setProduct({ id: snap.id, ...snap.data() } as Product);
      setLoading(false);
    });
  }, [id]);

  if (loading) return (
    <div className="flex flex-col gap-3">
      {[1,2,3,4].map(i => <div key={i} className="h-14 skeleton border border-mist" />)}
    </div>
  );

  if (!product) return <div className="py-8 text-center text-sm text-red-500">Produto não encontrado.</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Editar produto</h1>
        <p className="text-xs text-faint mt-1">{product.name}</p>
      </div>
      <ProductForm initial={product} />
    </div>
  );
}
