'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

const S = '#1E1208';
const FAINT = '#B09C8C';
const BORDER = '#E6DFD5';
const BG = '#FAF8F5';
const BGALT = '#F0EAE1';
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
      {[1,2,3,4].map(i => <div key={i} className="h-[72px] bg-[#F0EBE1] animate-pulse border border-[#E6DFD5]" />)}
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display font-normal text-[#1E1208] text-2xl">Produtos</h1>
        <p className="text-[13px] text-[#B09C8C] mt-1">Gerencie os produtos da sua loja. Produtos visíveis aparecem no site para os clientes.</p>
      </div>

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B09C8C]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Digite o nome do produto..."
            className="w-full border border-[#E6DFD5] bg-[#FAF8F5] pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40"
          />
        </div>
        <Link
          href="/painel/produtos/novo"
          className="shrink-0 bg-[#1E1208] text-[#FAF8F5] text-[11px] font-bold tracking-[0.1em] uppercase px-5 py-2.5 hover:bg-[#1E1208]/80 transition-colors"
        >
          + Novo produto
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-[#E6DFD5] py-16 text-center bg-[#FAF8F5]">
          <p className="text-4xl mb-3">{search ? '🔍' : '🛍'}</p>
          <p className="text-sm text-[#B09C8C]">{search ? 'Nenhum produto encontrado com esse nome.' : 'Você ainda não cadastrou nenhum produto.'}</p>
          {!search && <p className="text-[12px] text-[#C4714A] mt-2 font-semibold">Clique em "+ Novo produto" para começar!</p>}
        </div>
      ) : (
        <div className="bg-[#FAF8F5] border border-[#E6DFD5] overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[56px_1fr_100px_80px_80px_60px] gap-4 px-4 py-3 border-b border-[#E6DFD5] bg-[#F0EAE1]">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C]"></span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C]">Produto</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C]">Categoria</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] text-right">Preço</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C] text-center">Status</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C]"></span>
          </div>
          {filtered.map((p, idx) => (
            <div
              key={p.id}
              className={`grid grid-cols-[56px_1fr_auto] sm:grid-cols-[56px_1fr_100px_80px_80px_60px] gap-4 px-4 py-3 items-center hover:bg-[#F0EAE1] transition-colors ${idx < filtered.length - 1 ? 'border-b border-[#E6DFD5]' : ''}`}
            >
              {/* Thumb */}
              <div className="relative w-10 h-10 bg-[#F0EBE1] border border-[#E6DFD5] shrink-0 overflow-hidden">
                {p.images?.[0] ? (
                  <Image src={p.images[0]} alt={p.name} fill className="object-cover" sizes="40px" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <span className="font-display text-sm text-[#B09C8C]">M</span>
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#1E1208] leading-snug line-clamp-1">{p.name}</p>
                <p className="text-[11px] text-[#B09C8C] sm:hidden">{p.category} · {formatCurrency(p.price)}</p>
              </div>

              {/* Category — desktop */}
              <span className="hidden sm:block text-[12px] text-[#705A48] truncate">{p.category}</span>

              {/* Price — desktop */}
              <span className="hidden sm:block font-display text-sm text-[#1E1208] text-right">{formatCurrency(p.price)}</span>

              {/* Status */}
              <div className="hidden sm:flex justify-center">
                <button
                  onClick={() => toggleActive(p.id, p.active)}
                  className={`text-[10px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 border transition-colors ${
                    p.active
                      ? 'border-[#C4714A] text-[#C4714A] hover:bg-[#C4714A] hover:text-white'
                      : 'border-[#E6DFD5] text-[#B09C8C] hover:bg-[#F0EBE1]'
                  }`}
                >
                  {p.active ? '✓ Visível' : 'Oculto'}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => toggleActive(p.id, p.active)}
                  className={`sm:hidden text-[10px] font-bold tracking-[0.1em] uppercase px-2 py-1 border transition-colors ${
                    p.active
                      ? 'border-[#C4714A] text-[#C4714A]'
                      : 'border-[#E6DFD5] text-[#B09C8C]'
                  }`}
                >
                  {p.active ? '✓ Visível' : 'Oculto'}
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

      <p className="mt-3 text-[11px] text-[#B09C8C]">{filtered.length} produto{filtered.length !== 1 ? 's' : ''}</p>
    </div>
  );
}
