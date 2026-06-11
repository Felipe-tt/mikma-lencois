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
  const nameCache = useRef<Record<string, string>>({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventory'), async (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryItem));
      const uncachedIds = Array.from(new Set(data.map((i) => i.productId))).filter((id) => !nameCache.current[id]);
      if (uncachedIds.length > 0) {
        await Promise.all(uncachedIds.map(async (pid) => {
          const pdoc = await getDoc(doc(db, 'products', pid));
          nameCache.current[pid] = pdoc.exists() ? (pdoc.data().name as string) : pid;
        }));
      }
      setItems(data.map((i) => ({ ...i, productName: nameCache.current[i.productId] ?? i.productId })));
      setLoading(false);
    });
    return unsub;
  }, []);

  async function saveItem(id: string) {
    const e = editing[id];
    if (!e) return;
    await updateDoc(doc(db, 'inventory', id), { quantity: e.qty, lowStockThreshold: e.threshold });
    setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  function cancelEdit(id: string) {
    setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  const available = (item: InventoryItem) => item.quantity - item.reserved;
  const isLow = (item: InventoryItem) => available(item) <= item.lowStockThreshold;

  const filtered = items.filter((i) =>
    !search || i.productName?.toLowerCase().includes(search.toLowerCase())
  );

  const lowCount = items.filter(isLow).length;

  if (loading) return (
    <div className="flex flex-col gap-2">
      {[1,2,3,4].map(i => <div key={i} className="h-[72px] animate-pulse bg-[#F0EBE1] border border-[#E8E4DC]" />)}
    </div>
  );

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C4714A] mb-1">Inventário</p>
          <h1 className="font-display font-normal text-[#0F0E0C] text-2xl">Estoque</h1>
          {lowCount > 0 && (
            <p className="text-[11px] text-amber-600 font-semibold mt-1 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              {lowCount} {lowCount === 1 ? 'item abaixo' : 'itens abaixo'} do limite
            </p>
          )}
        </div>
        <Link
          href="/painel/produtos/novo"
          className="shrink-0 bg-[#0F0E0C] text-[#FAFAF8] text-[11px] font-bold tracking-[0.1em] uppercase px-5 py-2.5 hover:bg-[#0F0E0C]/80 transition-colors"
        >
          + Produto
        </Link>
      </div>

      {items.length > 3 && (
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B8B2AA]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="search"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-[#E8E4DC] bg-[#FAFAF8] pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border border-[#E8E4DC] bg-[#FAFAF8] py-16 text-center">
          <p className="text-sm text-[#B8B2AA]">
            {search ? 'Nenhum resultado.' : 'Nenhum item no estoque.'}
          </p>
          {!search && (
            <Link href="/painel/produtos/novo" className="mt-3 inline-block text-[12px] text-[#C4714A] font-semibold hover:text-[#A05432] transition-colors">
              Adicionar produto →
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-[#FAFAF8] border border-[#E8E4DC] overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_80px_80px_80px_160px] gap-4 px-5 py-3 border-b border-[#E8E4DC] bg-[#F5F3EF]">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA]">Produto / Variante</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA] text-center">Disponível</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA] text-center">Reservado</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA] text-center">Alerta</span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B8B2AA]"></span>
          </div>

          {filtered.map((item, idx) => {
            const e = editing[item.id];
            const low = isLow(item);
            const avail = available(item);

            return (
              <div
                key={item.id}
                className={`px-4 sm:px-5 py-4 transition-colors ${low ? 'bg-amber-50' : 'hover:bg-[#F5F3EF]'} ${idx < filtered.length - 1 ? 'border-b border-[#E8E4DC]' : ''}`}
              >
                {/* Mobile layout */}
                <div className="sm:hidden">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-[#0F0E0C] leading-tight">{item.productName}</p>
                      <p className="text-[11px] text-[#B8B2AA] mt-0.5">
                        {item.variant.size}{item.variant.fabric ? ` · ${item.variant.fabric}` : ''}
                        {item.sku && <span className="ml-1 font-mono opacity-50">#{item.sku.slice(-6)}</span>}
                      </p>
                    </div>
                    {low && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-1 shrink-0">BAIXO</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {['Disponível', 'Reservado', 'Alerta'].map((label, i) => (
                      <div key={label} className="text-center bg-[#F5F3EF] py-2">
                        <p className="text-[9px] font-bold tracking-[0.12em] uppercase text-[#B8B2AA] mb-1">{label}</p>
                        {e && i === 0 ? (
                          <input type="number" min={0} value={e.qty}
                            onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], qty: Number(ev.target.value) } }))}
                            className="w-full border border-[#C4714A]/40 bg-white px-1 py-0.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20" />
                        ) : e && i === 2 ? (
                          <input type="number" min={0} value={e.threshold}
                            onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], threshold: Number(ev.target.value) } }))}
                            className="w-full border border-[#E8E4DC] bg-white px-1 py-0.5 text-center text-sm focus:outline-none" />
                        ) : (
                          <p className={`text-base font-bold ${i === 0 && low ? 'text-amber-600' : 'text-[#0F0E0C]'}`}>
                            {i === 0 ? avail : i === 1 ? item.reserved : item.lowStockThreshold}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {e ? (
                    <div className="flex gap-2">
                      <button onClick={() => saveItem(item.id)} className="flex-1 bg-[#0F0E0C] text-white text-[11px] font-bold uppercase tracking-wide py-2.5 hover:bg-[#0F0E0C]/80 transition-colors">Salvar</button>
                      <button onClick={() => cancelEdit(item.id)} className="flex-1 border border-[#E8E4DC] text-[#6B6660] text-[11px] font-semibold py-2.5 hover:bg-[#F0EBE1] transition-colors">Cancelar</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditing(ed => ({ ...ed, [item.id]: { qty: avail, threshold: item.lowStockThreshold } }))}
                      className="w-full border border-[#E8E4DC] text-[#6B6660] text-[11px] font-semibold py-2.5 hover:bg-[#F0EBE1] transition-colors">
                      Ajustar estoque
                    </button>
                  )}
                </div>

                {/* Desktop layout */}
                <div className="hidden sm:grid grid-cols-[1fr_80px_80px_80px_160px] gap-4 items-center">
                  <div>
                    <p className="text-sm font-medium text-[#0F0E0C] leading-tight">{item.productName}</p>
                    <p className="text-[11px] text-[#B8B2AA] mt-0.5">
                      {item.variant.size}{item.variant.fabric ? ` · ${item.variant.fabric}` : ''}
                      {item.sku && <span className="ml-1 font-mono opacity-40">#{item.sku.slice(-6)}</span>}
                    </p>
                  </div>
                  <div className="text-center">
                    {e ? (
                      <input type="number" min={0} value={e.qty}
                        onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], qty: Number(ev.target.value) } }))}
                        className="w-full border border-[#C4714A]/40 bg-white px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20" />
                    ) : (
                      <span className={`font-display text-base ${low ? 'text-amber-600 font-bold' : 'text-[#0F0E0C]'}`}>{avail}{low && ' ⚠'}</span>
                    )}
                  </div>
                  <div className="text-center">
                    <span className="font-display text-base text-[#6B6660]">{item.reserved}</span>
                  </div>
                  <div className="text-center">
                    {e ? (
                      <input type="number" min={0} value={e.threshold}
                        onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], threshold: Number(ev.target.value) } }))}
                        className="w-full border border-[#E8E4DC] bg-white px-2 py-1 text-center text-sm focus:outline-none" />
                    ) : (
                      <span className="font-display text-base text-[#6B6660]">{item.lowStockThreshold}</span>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    {e ? (
                      <>
                        <button onClick={() => saveItem(item.id)} className="bg-[#0F0E0C] text-white text-[10px] font-bold uppercase tracking-wide px-3 py-2 hover:bg-[#0F0E0C]/80 transition-colors">Salvar</button>
                        <button onClick={() => cancelEdit(item.id)} className="border border-[#E8E4DC] text-[#6B6660] text-[10px] font-semibold px-3 py-2 hover:bg-[#F0EBE1] transition-colors">Cancelar</button>
                      </>
                    ) : (
                      <button onClick={() => setEditing(ed => ({ ...ed, [item.id]: { qty: avail, threshold: item.lowStockThreshold } }))}
                        className="border border-[#E8E4DC] text-[#6B6660] text-[10px] font-semibold px-3 py-2 hover:bg-[#F0EBE1] transition-colors">
                        Ajustar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
