'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { collection, getDocs, query as q, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { formatCurrency } from '@/lib/utils/format';
import type { Product } from '@/types';

/**
 * Sugestões enquanto a pessoa digita na busca do cabeçalho: produtos que
 * batem com o nome ou a categoria, com foto e preço. O catálogo é lido uma
 * vez só (na primeira letra) e fica em memória; antes, a busca só fazia
 * algo depois do Enter.
 */
let cache: Promise<Product[]> | null = null;
function loadProducts() {
  cache ??= getDocs(q(collection(db, 'products'), where('active', '==', true)))
    .then(s => s.docs.map(d => ({ id: d.id, ...d.data() }) as Product))
    .catch(() => { cache = null; return []; });
  return cache;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function SearchSuggestions({ query, onPick, className = '' }: { query: string; onPick: () => void; className?: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const term = fold(query.trim());

  useEffect(() => {
    if (!term || products) return;
    let alive = true;
    loadProducts().then(p => { if (alive) setProducts(p); });
    return () => { alive = false; };
  }, [term, products]);

  if (!term) return null;
  const words = term.split(/\s+/);
  const matches = (products ?? [])
    .filter(p => { const hay = fold(`${p.name} ${p.category}`); return words.every(w => hay.includes(w)); })
    .slice(0, 5);

  return (
    <div className={className}>
      {products === null ? (
        <p className="px-4 py-3 text-[13px] text-faint" role="status">Buscando…</p>
      ) : matches.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-mid" role="status">Nenhum produto com “{query.trim()}”.</p>
      ) : (
        <ul aria-label="Sugestões" className="py-1.5">
          {matches.map(p => (
            <li key={p.id}>
              <Link href={`/produtos/${p.id}`} onClick={onPick}
                className="flex items-center gap-3 px-4 py-2 hover:bg-warm focus-visible:bg-warm transition-colors">
                <span className="relative w-11 h-11 shrink-0 rounded-lg overflow-hidden bg-warm">
                  {p.images?.[0] && <Image src={p.images[0]} alt="" fill sizes="44px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-ink truncate">{p.name}</span>
                  <span className="block text-[11px] text-faint">{p.category}</span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-ink tabular-nums">{formatCurrency(p.price)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
