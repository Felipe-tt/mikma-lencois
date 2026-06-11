'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

const S = '#0F0E0C';
const FAINT = '#B8B2AA';
const BORDER = '#E8E4DC';
const BG = '#FAFAF8';
const BGALT = '#F5F3EF';
const CLAY = '#C4714A';

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
    <div className="flex flex-col gap-2">
      {[1,2,3,4].map(i => <div key={i} className="h-[72px] bg-[#F0EBE1] animate-pulse border border-[#E8E4DC]" />)}
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="mb-7">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Catálogo</p>
        <h1 className="font-display font-normal text-[#0F0E0C] text-2xl">Produtos</h1>
      </div>

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B8B2AA]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produto…"
            className="w-full border border-[#E8E4DC] bg-[#FAFAF8] pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40"
          />
        </div>
        <Link
          href="/painel/produtos/novo"
          className="shrink-0 bg-[#0F0E0C] text-[#FAFAF8] text-[11px] font-bold tracking-[0.1em] uppercase px-5 py-2.5 hover:bg-[#0F0E0C]/80 transition-colors"
        >
          + Novo produto
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-[#E8E4DC] py-16 text-center bg-[#FAFAF8]">
          <p className="text-sm text-[#B8B2AA]">{search ? 'Nenhum resultado.' : 'Nenhum produto cadastrado.'}</p>
        </div>
      ) : (
        <div className="bg-[#FAFAF8] border border-[#E8E4DC] overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[56px_1fr_100px_80px_80px_60px] gap-4 px-4 py-3 border-b border-[#E8E4DC] bg-[#F5F3EF]">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA]"></span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA]">Produto</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA]">Categoria</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA] text-right">Preço</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA] text-center">Status</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA]"></span>
          </div>
          {filtered.map((p, idx) => (
            <div
              key={p.id}
              className={`grid grid-cols-[56px_1fr_auto] sm:grid-cols-[56px_1fr_100px_80px_80px_60px] gap-4 px-4 py-3 items-center hover:bg-[#F5F3EF] transition-colors ${idx < filtered.length - 1 ? 'border-b border-[#E8E4DC]' : ''}`}
            >
              {/* Thumb */}
              <div className="relative w-10 h-10 bg-[#F0EBE1] border border-[#E8E4DC] shrink-0 overflow-hidden">
                {p.images?.[0] ? (
                  <Image src={p.images[0]} alt={p.name} fill className="object-cover" sizes="40px" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <span className="font-display text-sm text-[#B8B2AA]">M</span>
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0F0E0C] leading-snug line-clamp-1">{p.name}</p>
                <p className="text-[11px] text-[#B8B2AA] sm:hidden">{p.category} · {formatCurrency(p.price)}</p>
              </div>

              {/* Category — desktop */}
              <span className="hidden sm:block text-[12px] text-[#6B6660] truncate">{p.category}</span>

              {/* Price — desktop */}
              <span className="hidden sm:block font-display text-sm text-[#0F0E0C] text-right">{formatCurrency(p.price)}</span>

              {/* Status */}
              <div className="hidden sm:flex justify-center">
                <button
                  onClick={() => toggleActive(p.id, p.active)}
                  className={`text-[10px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 border transition-colors ${
                    p.active
                      ? 'border-[#C4714A] text-[#C4714A] hover:bg-[#C4714A] hover:text-white'
                      : 'border-[#E8E4DC] text-[#B8B2AA] hover:bg-[#F0EBE1]'
                  }`}
                >
                  {p.active ? 'Ativo' : 'Inativo'}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => toggleActive(p.id, p.active)}
                  className={`sm:hidden text-[10px] font-bold tracking-[0.1em] uppercase px-2 py-1 border transition-colors ${
                    p.active
                      ? 'border-[#C4714A] text-[#C4714A]'
                      : 'border-[#E8E4DC] text-[#B8B2AA]'
                  }`}
                >
                  {p.active ? 'Ativo' : 'Inativo'}
                </button>
                <Link
                  href={`/painel/produtos/${p.id}`}
                  className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors"
                >
                  Editar
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-[#B8B2AA]">{filtered.length} produto{filtered.length !== 1 ? 's' : ''}</p>
    </div>
  );
}
