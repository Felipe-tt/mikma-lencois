'use client';

import { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import Link from 'next/link';

type InventoryItem = {
  id: string;
  productId: string;
  productName?: string;
  sku: string;
  variant: { size: string; fabric: string; color: string };
  quantity: number;
  reserved: number;
  lowStockThreshold: number;
};

export default function EstoquePage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, { qty: number; threshold: number }>>({});
  const [search, setSearch] = useState('');
  // Cache de nomes de produto para evitar N+1 queries
  const nameCache = useRef<Record<string, string>>({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventory'), async (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryItem));

      // Só busca productIds que ainda não estão no cache
      const uncachedIds = Array.from(
        new Set(data.map((i) => i.productId))
      ).filter((id) => !nameCache.current[id]);

      if (uncachedIds.length > 0) {
        await Promise.all(
          uncachedIds.map(async (pid) => {
            const pdoc = await getDoc(doc(db, 'products', pid));
            nameCache.current[pid] = pdoc.exists() ? (pdoc.data().name as string) : pid;
          }),
        );
      }

      setItems(data.map((i) => ({ ...i, productName: nameCache.current[i.productId] ?? i.productId })));
      setLoading(false);
    });
    return unsub;
  }, []);

  async function saveItem(id: string) {
    const e = editing[id];
    if (!e) return;
    await updateDoc(doc(db, 'inventory', id), {
      quantity: e.qty,
      lowStockThreshold: e.threshold,
    });
    setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  function cancelEdit(id: string) {
    setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  const available = (item: InventoryItem) => item.quantity - item.reserved;
  const isLow = (item: InventoryItem) => available(item) <= item.lowStockThreshold;

  const filtered = items.filter((i) =>
    !search || i.productName?.toLowerCase().includes(search.toLowerCase()),
  );

  const lowCount = items.filter(isLow).length;

  if (loading) return (
    <div className="p-5 flex flex-col gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-xl bg-mist/40 animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="px-4 py-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-ink">Estoque</h1>
          {lowCount > 0 && (
            <p className="text-xs text-orange-600 font-medium mt-0.5">
              ⚠️ {lowCount} {lowCount === 1 ? 'item abaixo' : 'itens abaixo'} do limite
            </p>
          )}
        </div>
        <Link
          href="/painel/produtos/novo"
          className="flex items-center gap-1.5 bg-ink text-paper text-sm font-medium px-4 py-2 rounded-lg hover:bg-ink/80 transition-colors"
        >
          <span className="text-base leading-none">+</span> Produto
        </Link>
      </div>

      {/* Busca */}
      {items.length > 3 && (
        <div className="mb-4">
          <input
            type="search"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-mist rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-3xl mb-3">📦</p>
          <p className="text-sm text-faint">
            {search ? 'Nenhum resultado.' : 'Nenhum item no estoque.'}
          </p>
          {!search && (
            <Link href="/painel/produtos/novo" className="mt-4 inline-block text-sm text-clay font-medium">
              Adicionar produto
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => {
            const e = editing[item.id];
            const low = isLow(item);
            const avail = available(item);

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-4 transition-colors ${
                  low ? 'border-orange-200 bg-orange-50' : 'border-mist bg-paper'
                }`}
              >
                {/* Linha 1: nome + badge */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink text-sm leading-tight truncate">{item.productName}</p>
                    <p className="text-xs text-faint mt-0.5">
                      {item.variant.size}
                      {item.variant.fabric ? ` · ${item.variant.fabric}` : ''}
                      {item.sku && <span className="ml-1 font-mono opacity-50">#{item.sku.slice(-6)}</span>}
                    </p>
                  </div>
                  {item.variant.color && (
                    <div
                      className="w-5 h-5 rounded-full border border-mist shrink-0 mt-0.5"
                      style={{ background: item.variant.color.startsWith('#') ? item.variant.color : undefined }}
                      title={item.variant.color}
                    />
                  )}
                </div>

                {/* Métricas */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center">
                    <p className="text-2xs text-faint mb-0.5">Disponível</p>
                    {e ? (
                      <input
                        type="number" min={0} inputMode="numeric"
                        value={e.qty}
                        onChange={(ev) =>
                          setEditing((ed) => ({ ...ed, [item.id]: { ...ed[item.id], qty: Number(ev.target.value) } }))
                        }
                        className="w-full border border-clay/40 rounded-lg px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-clay/20"
                      />
                    ) : (
                      <p className={`text-lg font-bold ${low ? 'text-orange-600' : 'text-ink'}`}>
                        {avail}{low && ' ⚠️'}
                      </p>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-2xs text-faint mb-0.5">Reservado</p>
                    <p className="text-lg font-semibold text-mid">{item.reserved}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xs text-faint mb-0.5">Alerta</p>
                    {e ? (
                      <input
                        type="number" min={0} inputMode="numeric"
                        value={e.threshold}
                        onChange={(ev) =>
                          setEditing((ed) => ({ ...ed, [item.id]: { ...ed[item.id], threshold: Number(ev.target.value) } }))
                        }
                        className="w-full border border-mist rounded-lg px-2 py-1 text-center text-sm focus:outline-none"
                      />
                    ) : (
                      <p className="text-lg font-semibold text-mid">{item.lowStockThreshold}</p>
                    )}
                  </div>
                </div>

                {/* Ações */}
                {e ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveItem(item.id)}
                      className="flex-1 bg-ink text-paper text-xs font-semibold py-2.5 rounded-lg hover:bg-ink/80 transition-colors"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => cancelEdit(item.id)}
                      className="flex-1 border border-mist text-faint text-xs font-medium py-2.5 rounded-lg hover:bg-warm transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() =>
                      setEditing((ed) => ({ ...ed, [item.id]: { qty: avail, threshold: item.lowStockThreshold } }))
                    }
                    className="w-full border border-mist text-mid text-xs font-semibold py-2.5 rounded-lg hover:bg-warm transition-colors"
                  >
                    Ajustar estoque
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
