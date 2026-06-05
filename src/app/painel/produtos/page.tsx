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
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const toggleActive = async (id: string, active: boolean) => {
    await updateDoc(doc(db, 'products', id), { active: !active });
  };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-mist/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 py-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display font-normal text-ink text-xl sm:text-2xl">Produtos</h1>
        <Link
          href="/painel/produtos/novo"
          className="flex items-center gap-1.5 bg-ink text-paper text-sm font-medium px-4 py-2 rounded-lg hover:bg-ink/80 transition-colors"
        >
          <span className="text-base leading-none">+</span> Novo
        </Link>
      </div>

      {/* Busca */}
      <div className="mb-4">
        <input
          type="search"
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-mist rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-3xl mb-3">📦</p>
          <p className="text-sm text-faint">Nenhum produto encontrado.</p>
          <Link href="/painel/produtos/novo" className="mt-4 inline-block text-sm text-clay font-medium">
            Adicionar produto
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-3 py-3 rounded-xl border border-mist bg-paper"
            >
              {/* Imagem */}
              {p.images?.[0] ? (
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-warm border border-mist shrink-0">
                  <Image src={p.images[0]} alt={p.name} fill sizes="48px" className="object-cover" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-lg bg-warm border border-mist shrink-0" />
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink leading-tight truncate">{p.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-faint">{formatCurrency(p.price)}</span>
                  {p.category && <span className="text-xs text-faint">· {p.category}</span>}
                </div>
              </div>

              {/* Status toggle */}
              <button
                onClick={() => toggleActive(p.id, p.active)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors shrink-0 ${
                  p.active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-warm text-faint border-mist'
                }`}
              >
                {p.active ? 'Ativo' : 'Inativo'}
              </button>

              {/* Editar */}
              <Link
                href={`/painel/produtos/${p.id}`}
                className="text-faint hover:text-clay transition-colors shrink-0 p-1"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
