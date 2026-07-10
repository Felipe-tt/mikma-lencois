'use client';
import { IconBox } from '@/components/ui/Icon';
import { useEffect, useMemo, useState, useRef } from 'react';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import Link from 'next/link';

type MovementLog = { type: 'in' | 'out'; quantity: number; reason: string; date: string; by?: string };
type InventoryItem = {
  id: string; productId: string; productName?: string;
  variant: { size: string; fabric: string; color: string; colorName?: string };
  history?: MovementLog[];
};

type FlatMovement = MovementLog & { itemId: string; productName: string; variantLabel: string };

function variantLabel(item: InventoryItem) {
  return [item.variant.size, item.variant.fabric, item.variant.colorName || item.variant.color].filter(Boolean).join(' · ');
}

export default function HistoricoEstoquePage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'in' | 'out'>('todos');
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

  const movements = useMemo<FlatMovement[]>(() => {
    const flat: FlatMovement[] = [];
    for (const item of items) {
      for (const m of item.history || []) {
        flat.push({ ...m, itemId: item.id, productName: item.productName || item.id, variantLabel: variantLabel(item) });
      }
    }
    return flat
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter(m => typeFilter === 'todos' || m.type === typeFilter)
      .filter(m => !search
        || m.productName.toLowerCase().includes(search.toLowerCase())
        || m.reason.toLowerCase().includes(search.toLowerCase())
        || (m.by || '').toLowerCase().includes(search.toLowerCase()))
      .slice(0, 300);
  }, [items, search, typeFilter]);

  const totals = useMemo(() => {
    const out = movements.filter(m => m.type === 'out').reduce((s, m) => s + m.quantity, 0);
    const inn = movements.filter(m => m.type === 'in').reduce((s, m) => s + m.quantity, 0);
    return { out, inn };
  }, [movements]);

  if (loading) return (
    <div className="flex flex-col gap-2 max-w-4xl">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-[52px] skeleton border border-mist" />)}
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="font-display font-normal text-[#1E1208] text-2xl">Histórico de estoque</h1>
          <p className="text-[13px] text-[#B09C8C] mt-1">Todas as movimentações registradas, dos itens mais recentes.</p>
        </div>
        <Link href="/painel/estoque" className="shrink-0 border border-[#E6DFD5] text-[#705A48] text-[11px] font-bold tracking-[0.08em] uppercase px-4 py-2.5 hover:bg-[#F0EBE1] transition-colors">
          Voltar ao estoque
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="text-center bg-[#FAF8F5] border border-[#E6DFD5] px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#B09C8C] mb-1">Saídas (no filtro atual)</p>
          <p className="text-2xl font-bold text-red-600">{totals.out}</p>
        </div>
        <div className="text-center bg-[#FAF8F5] border border-[#E6DFD5] px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#B09C8C] mb-1">Entradas (no filtro atual)</p>
          <p className="text-2xl font-bold text-emerald-700">{totals.inn}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B09C8C]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="search" placeholder="Buscar por produto, motivo ou quem registrou..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-[#E6DFD5] bg-[#FAF8F5] pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/40" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'todos' | 'in' | 'out')}
          className="border border-[#E6DFD5] bg-[#FAF8F5] px-3 py-2.5 text-sm focus:outline-none">
          <option value="todos">Tudo</option>
          <option value="out">Só saídas</option>
          <option value="in">Só entradas</option>
        </select>
      </div>

      {movements.length === 0 ? (
        <div className="border border-[#E6DFD5] bg-[#FAF8F5] py-16 text-center">
          <IconBox size={40} className="text-[#E6DFD5] mx-auto mb-3" />
          <p className="text-sm text-[#B09C8C]">Nenhuma movimentação encontrada.</p>
        </div>
      ) : (
        <div className="border border-[#E6DFD5] bg-[#FAF8F5] divide-y divide-[#E6DFD5]">
          {movements.map((m, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#1E1208] truncate">{m.productName} <span className="font-normal text-[#B09C8C]">· {m.variantLabel}</span></p>
                <p className="text-[11px] text-[#B09C8C] truncate">{m.reason}{m.by ? ` — ${m.by}` : ''}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-[13px] font-bold ${m.type === 'out' ? 'text-red-600' : 'text-emerald-700'}`}>{m.type === 'out' ? '−' : '+'}{m.quantity}</p>
                <p className="text-[10px] text-[#B09C8C]">{new Date(m.date).toLocaleString('pt-BR')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {movements.length === 300 && (
        <p className="text-[11px] text-[#B09C8C] mt-3 text-center">Mostrando as 300 movimentações mais recentes.</p>
      )}
    </div>
  );
}
