'use client';
import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, writeBatch, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { IconBox, IconCheck, IconX, IconSearch, IconInventory } from '@/components/ui/Icon';
import type { MovementLog } from '@/types';

export type InventoryItem = {
  id: string; productId: string; productName?: string; sku: string;
  variant: { size: string; fabric: string; color: string; colorName?: string };
  quantity: number; reserved: number; lowStockThreshold: number; history?: MovementLog[];
};

const COL_OPTIONS = [3, 4, 5, 6];
const COLS_KEY = 'mikma_estoque_grid_cols';

function normalize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function variantLabel(item: InventoryItem) {
  return [item.variant.size, item.variant.fabric, item.variant.colorName || item.variant.color].filter(Boolean).join(' · ');
}

export function NovaVendaSheet({ items, onClose, onDone, embedded = false }: {
  items: InventoryItem[];
  onClose?: () => void;
  onDone: (msg: string, onUndo?: () => void) => void;
  /** Se true, renderiza dentro da página normal (sem tela cheia, sem X de fechar). */
  embedded?: boolean;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'venda' | 'reposicao'>('venda');
  const [cols, setCols] = useState(4);
  const [search, setSearch] = useState('');
  const [deltas, setDeltas] = useState<Record<string, number>>({}); // negativo = venda, positivo = reposição
  const [images, setImages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(COLS_KEY));
    if (COL_OPTIONS.includes(saved)) setCols(saved);
  }, []);

  useEffect(() => {
    const ids = Array.from(new Set(items.map(i => i.productId))).filter(id => !(id in images));
    if (ids.length === 0) return;
    (async () => {
      const entries = await Promise.all(ids.map(async (id) => {
        try {
          const snap = await getDoc(doc(db, 'products', id));
          const imgs = snap.exists() ? (snap.data().images as string[] | undefined) : undefined;
          return [id, imgs?.[0] || ''] as const;
        } catch {
          return [id, ''] as const;
        }
      }));
      setImages(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function changeCols(n: number) {
    setCols(n);
    window.localStorage.setItem(COLS_KEY, String(n));
  }

  function tap(item: InventoryItem) {
    setDeltas(d => {
      const cur = d[item.id] || 0;
      const next = mode === 'venda' ? cur - 1 : cur + 1;
      if (next === 0) { const n = { ...d }; delete n[item.id]; return n; }
      return { ...d, [item.id]: next };
    });
  }

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = normalize(search);
    return items.filter(i => normalize(i.productName || '').includes(q) || normalize(variantLabel(i)).includes(q) || normalize(i.sku || '').includes(q));
  }, [items, search]);

  const pendingEntries = Object.entries(deltas).filter(([, d]) => d !== 0);
  const pendingCount = pendingEntries.length;
  const pendingUnits = pendingEntries.reduce((s, [, d]) => s + Math.abs(d), 0);

  function clearAll() {
    setDeltas({});
  }

  async function confirmAll() {
    if (pendingCount === 0 || saving) return;
    const withItems = pendingEntries
      .map(([id, delta]) => ({ item: items.find(i => i.id === id), delta }))
      .filter((e): e is { item: InventoryItem; delta: number } => !!e.item);

    const overAvail = withItems.filter(({ item, delta }) => delta < 0 && Math.abs(delta) > (item.quantity - item.reserved));
    if (overAvail.length > 0) {
      const ok = window.confirm(
        `${overAvail.length === 1 ? 'Um item vai ficar' : `${overAvail.length} itens vão ficar`} negativo no estoque ` +
        `(ex: "${overAvail[0].item.productName} · ${variantLabel(overAvail[0].item)}"). Confere antes de continuar. Salvar mesmo assim?`
      );
      if (!ok) return;
    }

    setSaving(true);
    const batchId = `mov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logs: { itemId: string; log: MovementLog }[] = [];
    try {
      const batch = writeBatch(db);
      for (const { item, delta } of withItems) {
        const qty = Math.abs(delta);
        const type: 'in' | 'out' = delta < 0 ? 'out' : 'in';
        const log: MovementLog = {
          type, quantity: qty,
          reason: type === 'out' ? 'Venda presencial (loja física)' : 'Reposição de estoque',
          date: new Date().toISOString(), saleId: batchId,
          ...(user?.email ? { by: user.email } : {}),
        };
        logs.push({ itemId: item.id, log });
        batch.update(doc(db, 'inventory', item.id), {
          quantity: increment(delta),
          history: arrayUnion(log),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();

      const sales = withItems.filter(e => e.delta < 0).length;
      const restocks = withItems.filter(e => e.delta > 0).length;
      const parts = [];
      if (sales > 0) parts.push(`${sales} ${sales === 1 ? 'venda' : 'vendas'}`);
      if (restocks > 0) parts.push(`${restocks} ${restocks === 1 ? 'reposição' : 'reposições'}`);

      onDone(`Registrado: ${parts.join(' e ')} (${pendingUnits} peças).`, async () => {
        try {
          const undoBatch = writeBatch(db);
          for (const { itemId, log } of logs) {
            undoBatch.update(doc(db, 'inventory', itemId), {
              quantity: increment(log.type === 'out' ? log.quantity : -log.quantity),
              history: arrayUnion({
                type: log.type === 'out' ? 'in' : 'out', quantity: log.quantity, reason: `Desfeito: ${log.reason}`,
                date: new Date().toISOString(), saleId: batchId, ...(user?.email ? { by: user.email } : {}),
              }),
              updatedAt: serverTimestamp(),
            });
          }
          await undoBatch.commit();
        } catch (err) {
          console.error('[nova-venda] falha ao desfazer', err);
        }
      });
      setDeltas({});
    } catch (err) {
      console.error('[nova-venda] falha ao salvar', err);
      onDone('Não deu pra salvar — tenta de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={embedded ? 'flex flex-col' : 'fixed inset-0 z-[60] bg-paper flex flex-col'}>
      {/* Cabeçalho */}
      <div className={`px-4 py-3 shrink-0 flex flex-col gap-3 ${embedded ? '' : 'border-b border-mist'}`}>
        {!embedded && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-bold text-ink">Registrar movimentação</p>
            <button onClick={onClose} className="text-faint hover:text-mid p-1.5" aria-label="Fechar">
              <IconX size={20} />
            </button>
          </div>
        )}

        {/* Venda ou Reposição */}
        <div className="grid grid-cols-2 border border-mist p-1 bg-white dark:bg-warm">
          <button onClick={() => setMode('venda')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[13px] font-bold uppercase tracking-wide transition-colors ${mode === 'venda' ? 'bg-red-500 text-white' : 'text-mid'}`}>
            <IconX size={14} /> Vender
          </button>
          <button onClick={() => setMode('reposicao')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[13px] font-bold uppercase tracking-wide transition-colors ${mode === 'reposicao' ? 'bg-emerald-600 text-white' : 'text-mid'}`}>
            <IconCheck size={14} /> Chegou mercadoria
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            <input type="search" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-mist bg-white dark:bg-warm pl-8 pr-2 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-clay-l/20" />
          </div>
          <div className="flex items-center shrink-0 border border-mist bg-white dark:bg-warm">
            <span className="flex items-center pl-2 pr-1 text-faint" title="Quantas fotos por linha">
              <IconInventory size={13} />
            </span>
            {COL_OPTIONS.map(n => (
              <button key={n} onClick={() => changeCols(n)} title={`${n} fotos por linha`}
                className={`w-7 h-8 text-[12px] font-bold ${cols === n ? 'bg-ink text-paper' : 'text-mid'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[12px] text-faint -mt-1.5">
          {mode === 'venda'
            ? 'Toque na foto do produto pra registrar 1 venda. Toque de novo se vendeu mais de 1.'
            : 'Toque na foto do produto pra registrar 1 chegada. Toque de novo se chegou mais de 1.'}
          {' '}Tocou errado? Aperta o outro botão aí em cima e toque de novo no mesmo produto pra corrigir.
        </p>
      </div>

      {/* Grid */}
      <div className={embedded ? 'py-4' : 'flex-1 overflow-y-auto px-4 py-4'}>
        {filteredItems.length === 0 ? (
          <p className="text-[12px] text-faint text-center py-10">Nenhum produto encontrado.</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {filteredItems.map(item => {
              const delta = deltas[item.id] || 0;
              const avail = item.quantity - item.reserved;
              const image = images[item.productId];
              return (
                <div key={item.id} className="flex flex-col gap-1">
                  <p className="text-[10px] font-semibold text-ink truncate px-0.5">{item.productName}</p>
                  <button onClick={() => tap(item)}
                    className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-colors ${
                      delta < 0 ? 'border-red-500' : delta > 0 ? 'border-emerald-500' : 'border-mist'
                    }`}>
                    {image ? (
                      <img src={image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-warm flex items-center justify-center">
                        <IconBox size={26} className="text-[#D8CDBE]" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1.5 text-left">
                      <p className="text-[9px] text-white/85 truncate leading-tight">{variantLabel(item)}</p>
                      <p className="text-[10.5px] font-bold text-white leading-tight">{avail} em estoque</p>
                    </div>
                    {delta !== 0 && (
                      <>
                        <span className={`absolute top-1 right-1 h-5 w-5 rounded-full flex items-center justify-center text-white text-[12px] font-bold leading-none ${delta < 0 ? 'bg-red-500' : 'bg-emerald-500'}`}>
                          {delta < 0 ? '×' : '✓'}
                        </span>
                        <span className={`absolute top-1 left-1 h-5 min-w-5 px-1 rounded-full flex items-center justify-center text-white text-[11px] font-bold leading-none ${delta < 0 ? 'bg-red-500' : 'bg-emerald-500'}`}>
                          {delta < 0 ? `−${Math.abs(delta)}` : `+${delta}`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra de confirmação */}
      <div className={`px-4 py-3 flex items-center gap-2 bg-paper ${embedded ? 'sticky bottom-0 border-t border-mist shadow-[0_-4px_10px_rgba(0,0,0,0.06)]' : 'border-t border-mist shrink-0'}`}>
        {pendingCount > 0 && (
          <button onClick={clearAll} disabled={saving}
            className="shrink-0 border border-mist text-mid text-[12px] font-semibold px-3 py-3 hover:bg-warm disabled:opacity-50">
            Limpar
          </button>
        )}
        <button onClick={confirmAll} disabled={pendingCount === 0 || saving}
          className="flex-1 h-12 bg-ink text-paper text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-ink/80 transition-colors">
          <IconCheck size={15} />
          {saving ? 'Salvando...' : pendingCount === 0 ? 'Toque nos produtos acima' : `Confirmar (${pendingCount} ${pendingCount === 1 ? 'produto' : 'produtos'} · ${pendingUnits} ${pendingUnits === 1 ? 'peça' : 'peças'})`}
        </button>
      </div>
    </div>
  );
}
