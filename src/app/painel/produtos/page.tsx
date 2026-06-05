'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';

function ProdutosTableSkeleton() {
  return (
    <div className="border border-mist overflow-hidden">
      <div className="bg-warm px-5 py-3 border-b border-mist grid grid-cols-[1fr_120px_80px_80px_60px] gap-4">
        {['Produto', 'Categoria', 'Preço', 'Status', ''].map(h => (
          <Skeleton key={h} className="h-2.5 w-16" />
        ))}
      </div>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-mist last:border-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Skeleton className="w-10 h-10 shrink-0" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-3.5 w-10" />
        </div>
      ))}
    </div>
  );
}

export default function PainelProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const toggleActive = async (id: string, active: boolean) => {
    await updateDoc(doc(db, 'products', id), { active: !active });
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Produtos</h1>
        <Link href="/painel/produtos/novo" className="btn-primary text-xs px-4 py-2.5 tracking-wide">
          + Novo produto
        </Link>
      </div>

      <div className="mb-5">
        <input
          type="text"
          placeholder="Buscar produto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input max-w-sm"
        />
      </div>

      {loading ? (
        <ProdutosTableSkeleton />
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-faint">Nenhum produto encontrado.</p>
        </div>
      ) : (
        <div className="border border-mist overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-warm border-b border-mist">
              <tr>
                <th className="text-left px-5 py-3 text-2xs font-semibold tracking-[0.15em] uppercase text-faint">Produto</th>
                <th className="text-left px-4 py-3 text-2xs font-semibold tracking-[0.15em] uppercase text-faint">Categoria</th>
                <th className="text-right px-4 py-3 text-2xs font-semibold tracking-[0.15em] uppercase text-faint">Preço</th>
                <th className="text-center px-4 py-3 text-2xs font-semibold tracking-[0.15em] uppercase text-faint">Status</th>
                <th className="text-right px-5 py-3 text-2xs font-semibold tracking-[0.15em] uppercase text-faint">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist bg-paper">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-warm transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {p.images?.[0] ? (
                        <div className="relative w-10 h-10 shrink-0 overflow-hidden bg-warm border border-mist">
                          <Image src={p.images[0]} alt={p.name} fill sizes="40px" className="object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-warm border border-mist shrink-0" />
                      )}
                      <span className="font-medium text-ink line-clamp-2">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-mid">{p.category || '—'}</td>
                  <td className="px-4 py-3.5 text-right font-medium text-ink font-mono">
                    {formatCurrency(p.price)}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => toggleActive(p.id, p.active)}
                      className={`text-xs px-2.5 py-1 font-medium border transition-colors ${
                        p.active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-warm text-faint border-mist hover:bg-mist'
                      }`}
                    >
                      {p.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/painel/produtos/${p.id}`} className="text-clay text-xs font-semibold hover:text-clay-d transition-colors">
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
