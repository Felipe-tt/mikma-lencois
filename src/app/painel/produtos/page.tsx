'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

export default function PainelProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'products'), orderBy('createdAt', 'desc')),
      snap => { setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))); setLoading(false); }
    );
  }, []);

  const toggleActive = async (id: string, active: boolean) =>
    updateDoc(doc(db, 'products', id), { active: !active });

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex flex-col gap-3">
      {[1,2,3].map(i => <div key={i} className="h-20 bg-warm animate-pulse border border-mist" />)}
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <span className="eyebrow mb-1 block">Catálogo</span>
        <h1 className="font-display font-normal text-ink text-2xl">Produtos</h1>
      </div>

      <div className="flex gap-3 mb-5">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar produto…"
          className="input flex-1"
        />
        <Link href="/painel/produtos/novo" className="btn-primary px-5 py-2.5 text-sm shrink-0">
          + Novo
        </Link>
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-faint border border-mist">
          {search ? 'Nenhum resultado.' : 'Nenhum produto cadastrado.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(p => (
            <div key={p.id} className="border border-mist bg-paper p-3 flex items-center gap-3">
              {/* Thumb */}
              <div className="relative w-14 h-14 bg-warm border border-mist shrink-0 overflow-hidden">
                {p.images?.[0] ? (
                  <Image src={p.images[0]} alt={p.name} fill className="object-cover" sizes="56px" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <span className="font-display text-xl text-faint">M</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink leading-snug line-clamp-1">{p.name}</p>
                <p className="text-xs text-faint">{p.category}</p>
                <p className="font-display text-sm text-ink mt-0.5">{formatCurrency(p.price)}</p>
              </div>

              {/* Actions */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button onClick={() => toggleActive(p.id, p.active)}
                  className={`text-2xs font-bold tracking-wide uppercase px-2.5 py-1 border transition-colors ${
                    p.active
                      ? 'border-clay text-clay hover:bg-clay hover:text-paper'
                      : 'border-mist text-faint hover:bg-warm'
                  }`}>
                  {p.active ? 'Ativo' : 'Inativo'}
                </button>
                <Link href={`/painel/produtos/${p.id}`}
                  className="text-xs font-semibold text-clay hover:text-clay-d transition-colors">
                  Editar
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
