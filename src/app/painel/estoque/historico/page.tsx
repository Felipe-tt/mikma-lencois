'use client';
import { IconBox } from '@/components/ui/Icon';
import { useEffect, useMemo, useState, useRef } from 'react';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import Link from 'next/link';
import { Select } from '@/components/ui/Select';

type MovementLog = { type: 'in' | 'out'; quantity: number; reason: string; date: string; by?: string; saleId?: string };
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

  // Várias peças vendidas juntas (mesma "venda" no carrinho) viram um cartão só, em vez de N linhas soltas
  const displayRows = useMemo(() => {
    const rows: Array<{ kind: 'sale'; saleId: string; date: string; lines: FlatMovement[] } | { kind: 'single'; m: FlatMovement }> = [];
    const seenSale = new Set<string>();
    for (const m of movements) {
      if (m.saleId) {
        if (seenSale.has(m.saleId)) continue;
        seenSale.add(m.saleId);
        rows.push({ kind: 'sale', saleId: m.saleId, date: m.date, lines: movements.filter(x => x.saleId === m.saleId) });
      } else {
        rows.push({ kind: 'single', m });
      }
    }
    return rows;
  }, [movements]);

  const totals = useMemo(() => {
    const out = movements.filter(m => m.type === 'out').reduce((s, m) => s + m.quantity, 0);
    const inn = movements.filter(m => m.type === 'in').reduce((s, m) => s + m.quantity, 0);
    return { out, inn };
  }, [movements]);

  if (loading) return (
    <div className="flex flex-col gap-2 max-w-6xl mx-auto">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-[52px] skeleton border border-mist" />)}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="font-display font-normal text-ink text-2xl">Histórico de estoque</h1>
          <p className="text-[13px] text-faint mt-1">Todas as movimentações registradas, dos itens mais recentes.</p>
        </div>
        <Link href="/painel/estoque" className="shrink-0 border border-mist text-mid text-[11px] font-bold tracking-[0.08em] uppercase px-4 py-2.5 hover:bg-warm transition-colors">
          Voltar ao estoque
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="text-center bg-paper border border-mist px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-faint mb-1">Saídas (no filtro atual)</p>
          <p className="text-2xl font-bold text-red-600">{totals.out}</p>
        </div>
        <div className="text-center bg-paper border border-mist px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-faint mb-1">Entradas (no filtro atual)</p>
          <p className="text-2xl font-bold text-emerald-700">{totals.inn}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="search" placeholder="Buscar por produto, motivo ou quem registrou..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-mist bg-paper pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20 focus:border-clay-l/40" />
        </div>
        <Select
          value={typeFilter}
          onChange={v => setTypeFilter(v as 'todos' | 'in' | 'out')}
          options={[
            { value: 'todos', label: 'Tudo' },
            { value: 'out', label: 'Só saídas' },
            { value: 'in', label: 'Só entradas' },
          ]}
          triggerClassName="border border-mist bg-paper px-3 py-2.5 text-sm focus:outline-none rounded-[2px] flex items-center justify-between gap-2 cursor-pointer hover:border-ink/20 transition-all min-w-[160px]"
        />
      </div>

      {displayRows.length === 0 ? (
        <div className="border border-mist bg-paper py-16 text-center">
          <IconBox size={40} className="text-mist mx-auto mb-3" />
          <p className="text-sm text-faint">Nenhuma movimentação encontrada.</p>
        </div>
      ) : (
        <div className="border border-mist bg-paper divide-y divide-mist">
          {displayRows.map((row, i) => row.kind === 'single' ? (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink truncate">{row.m.productName} <span className="font-normal text-faint">· {row.m.variantLabel}</span></p>
                <p className="text-[11px] text-faint truncate">{row.m.reason}{row.m.by ? ` — ${row.m.by}` : ''}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-[13px] font-bold ${row.m.type === 'out' ? 'text-red-600' : 'text-emerald-700'}`}>{row.m.type === 'out' ? '−' : '+'}{row.m.quantity}</p>
                <p className="text-[10px] text-faint">{new Date(row.m.date).toLocaleString('pt-BR')}</p>
              </div>
            </div>
          ) : (
            <div key={i} className="px-4 py-2.5 bg-emerald-50/40">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <p className="text-[12px] font-bold text-emerald-800">🧾 Venda com {row.lines.length} {row.lines.length === 1 ? 'item' : 'itens'}{row.lines[0].by ? ` — ${row.lines[0].by}` : ''}</p>
                <p className="text-[10px] text-faint shrink-0">{new Date(row.date).toLocaleString('pt-BR')}</p>
              </div>
              <div className="flex flex-col gap-0.5 pl-1">
                {row.lines.map((l, j) => (
                  <p key={j} className="text-[12px] text-ink">
                    <span className="text-red-600 font-semibold">−{l.quantity}</span> {l.productName} · {l.variantLabel}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {movements.length === 300 && (
        <p className="text-[11px] text-faint mt-3 text-center">Mostrando as 300 movimentações mais recentes.</p>
      )}
    </div>
  );
}
