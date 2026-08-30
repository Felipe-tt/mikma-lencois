'use client';

/**
 * Popup "Duplicar produto existente" — ponto de partida rápido pro
 * cadastro de um produto parecido com um que já existe (mesma categoria,
 * tamanho, tecidos, especificações). Copia só o que tende a se repetir
 * entre produtos parecidos; NUNCA copia fotos, cores ou quantidade em
 * estoque, que são específicas daquele lote/produto.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs, orderBy, query, limit as fbLimit } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Product } from '@/types';
import { SIZE_LABEL } from '@/lib/productOptions';

type Props = {
  onPick: (product: Product) => void;
  onClose: () => void;
};

export function DuplicateProductModal({ onPick, onClose }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc'), fbLimit(80)))
      .then(snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = search.trim()
    ? products.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-paper w-full max-w-md rounded-[6px] shadow-xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-mist shrink-0">
          <h2 className="text-[14px] font-bold text-ink mb-2">Duplicar produto existente</h2>
          <p className="text-[11px] text-faint mb-3">
            Copia nome, categoria, tamanho, tecidos, peso e especificações. Fotos, cores e estoque ficam em branco pra você preencher.
          </p>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="input"
          />
        </div>

        <div className="overflow-y-auto flex-1">
          {loading && <p className="text-[12px] text-faint text-center py-8">Carregando…</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-[12px] text-faint text-center py-8">Nenhum produto encontrado</p>
          )}
          {!loading && filtered.map(p => (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-warm transition-colors text-left border-b border-mist/50 last:border-0"
            >
              {p.images?.[0] ? (
                <img src={p.images[0]} alt="" className="w-10 h-10 object-cover rounded-[4px] shrink-0 border border-mist" />
              ) : (
                <div className="w-10 h-10 bg-mist/40 rounded-[4px] shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink truncate">{p.name}</p>
                <p className="text-[11px] text-faint truncate">
                  {p.category}
                  {p.variants?.[0]?.size && ` · ${SIZE_LABEL[p.variants[0].size] ?? p.variants[0].size}`}
                  {' · '}R$ {(p.price / 100).toFixed(2)}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-mist shrink-0">
          <button onClick={onClose} className="w-full border border-mist px-4 py-2.5 text-[13px] font-medium text-mid hover:bg-warm transition-colors rounded-[4px]">
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
