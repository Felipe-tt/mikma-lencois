'use client';

import { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import Link from 'next/link';

type InventoryItem = {
  id: string; productId: string; productName?: string; sku: string;
  variant: { size: string; fabric: string; color: string };
  quantity: number; reserved: number; lowStockThreshold: number;
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

  const available = (item: InventoryItem) => item.quantity - item.reserved;
  const isLow = (item: InventoryItem) => available(item) <= item.lowStockThreshold;
  const filtered = items.filter(i => !search || i.productName?.toLowerCase().includes(search.toLowerCase()));
  const lowCount = items.filter(isLow).length;

  if (loading) return (
    <div className="flex flex-col gap-2">
      {[1,2,3,4].map(i => <div key={i} className="h-[72px] skeleton border border-mist" />)}
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display font-normal text-[#1E1208] text-2xl">Estoque</h1>
          <p className="text-[13px] text-[#B09C8C] mt-1">Controle quantas unidades de cada produto você tem disponível.</p>
        </div>
        <Link href="/painel/produtos/novo" className="shrink-0 bg-[#1E1208] text-[#FAF8F5] text-[11px] font-bold tracking-[0.1em] uppercase px-5 py-2.5 hover:bg-[#1E1208]/80 transition-colors">
          + Produto
        </Link>
      </div>

      {lowCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 px-4 py-3 mb-5 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <p className="text-[13px] text-amber-800">
            <strong>{lowCount} {lowCount === 1 ? 'produto está' : 'produtos estão'} quase acabando!</strong>
            {' '}Verifique os itens destacados em amarelo abaixo e reabasteça o estoque.
          </p>
        </div>
      )}

      {items.length > 3 && (
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B09C8C]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-[#E6DFD5] bg-[#FAF8F5] pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40" />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border border-[#E6DFD5] bg-[#FAF8F5] py-16 text-center">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-sm text-[#B09C8C]">{search ? 'Nenhum resultado.' : 'Nenhum produto no estoque ainda.'}</p>
          {!search && <Link href="/painel/produtos/novo" className="mt-3 inline-block text-[12px] text-[#C4714A] font-semibold">Adicionar produto</Link>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => {
            const e = editing[item.id];
            const low = isLow(item);
            const avail = available(item);
            return (
              <div key={item.id} className={`border px-5 py-4 ${low ? 'border-amber-200 bg-amber-50' : 'border-[#E6DFD5] bg-[#FAF8F5]'}`}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-[14px] font-semibold text-[#1E1208]">{item.productName}</p>
                    <p className="text-[12px] text-[#B09C8C] mt-0.5">
                      Tamanho: {item.variant.size}{item.variant.fabric ? ` · ${item.variant.fabric}` : ''}
                    </p>
                  </div>
                  {low && <span className="shrink-0 text-[11px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1">⚠️ ACABANDO</span>}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center bg-white border border-[#E6DFD5] px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#B09C8C] mb-1">Disponível para venda</p>
                    {e ? (
                      <input type="number" min={0} value={e.qty}
                        onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], qty: Number(ev.target.value) } }))}
                        className="w-full border border-[#C4714A]/40 text-center text-lg font-bold text-[#1E1208] py-1 focus:outline-none" />
                    ) : (
                      <p className={`text-2xl font-bold ${low ? 'text-amber-600' : 'text-[#1E1208]'}`}>{avail}</p>
                    )}
                    <p className="text-[10px] text-[#B09C8C] mt-1">unidades</p>
                  </div>
                  <div className="text-center bg-white border border-[#E6DFD5] px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#B09C8C] mb-1">Reservado (pedidos)</p>
                    <p className="text-2xl font-bold text-[#705A48]">{item.reserved}</p>
                    <p className="text-[10px] text-[#B09C8C] mt-1">em pedidos ativos</p>
                  </div>
                  <div className="text-center bg-white border border-[#E6DFD5] px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#B09C8C] mb-1">Avisar quando restar</p>
                    {e ? (
                      <input type="number" min={0} value={e.threshold}
                        onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], threshold: Number(ev.target.value) } }))}
                        className="w-full border border-[#E6DFD5] text-center text-lg font-bold text-[#705A48] py-1 focus:outline-none" />
                    ) : (
                      <p className="text-2xl font-bold text-[#705A48]">{item.lowStockThreshold}</p>
                    )}
                    <p className="text-[10px] text-[#B09C8C] mt-1">unidades</p>
                  </div>
                </div>

                {e ? (
                  <div className="flex gap-2">
                    <button onClick={() => saveItem(item.id)} className="flex-1 bg-[#1E1208] text-white text-[12px] font-bold py-2.5 hover:bg-[#1E1208]/80 transition-colors">✓ Salvar</button>
                    <button onClick={() => setEditing(ed => { const n = {...ed}; delete n[item.id]; return n; })} className="flex-1 border border-[#E6DFD5] text-[#705A48] text-[12px] font-semibold py-2.5 hover:bg-[#F0EBE1] transition-colors">Cancelar</button>
                  </div>
                ) : (
                  <button onClick={() => setEditing(ed => ({ ...ed, [item.id]: { qty: avail, threshold: item.lowStockThreshold } }))}
                    className="w-full border border-[#E6DFD5] text-[#705A48] text-[12px] font-semibold py-2.5 hover:bg-[#F0EBE1] transition-colors">
                    Ajustar quantidade
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
