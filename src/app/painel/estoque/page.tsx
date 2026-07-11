'use client';
import { IconAlert, IconBox, IconCheck, IconMinusCircle, IconPlusCircle, IconListCheck } from '@/components/ui/Icon';
import { NovaVendaSheet } from '@/components/painel/NovaVendaSheet';

import { useEffect, useMemo, useState, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, getDoc, increment, arrayUnion, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';

type MovementLog = { type: 'in' | 'out'; quantity: number; reason: string; date: string; by?: string; saleId?: string };
type InventoryItem = {
  id: string; productId: string; productName?: string; sku: string;
  variant: { size: string; fabric: string; color: string; colorName?: string };
  quantity: number; reserved: number; lowStockThreshold: number; history?: MovementLog[];
};

function normalize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function variantLabel(item: InventoryItem) {
  const parts = [item.variant.size, item.variant.fabric, item.variant.colorName || item.variant.color].filter(Boolean);
  return parts.join(' · ');
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function EstoquePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'dia' | 'contagem'>('dia');
  const [subview, setSubview] = useState<'grade' | 'lista'>('grade');

  // Modo dia-a-dia: qual item tem um formulário de ação aberto
  const [actionFor, setActionFor] = useState<{ id: string; kind: 'venda' | 'entrada' | 'correcao' } | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<Record<string, number>>({});
  const [onlyLow, setOnlyLow] = useState(false);

  // Modo contagem geral
  const [countDraft, setCountDraft] = useState<Record<string, number>>({});
  const [savingCount, setSavingCount] = useState(false);

  const [toast, setToast] = useState<{ msg: string; onUndo?: () => void } | null>(null);
  const nameCache = useRef<Record<string, string>>({});

  function showToast(msg: string, onUndo?: () => void) {
    setToast({ msg, onUndo });
    setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), onUndo ? 5000 : 2600);
  }

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
      setItems(data.map((i) => ({ ...i, productName: nameCache.current[i.productId] ?? i.productId }))
        .sort((a, b) => (a.productName || '').localeCompare(b.productName || '')));
      setLoading(false);
    });
    return unsub;
  }, []);

  const available = (item: InventoryItem) => item.quantity - item.reserved;
  const isLow = (item: InventoryItem) => available(item) <= item.lowStockThreshold;
  const filtered = items
    .filter(i => {
      if (!search) return true;
      const q = normalize(search);
      return normalize(i.productName || '').includes(q) || normalize(variantLabel(i)).includes(q) || normalize(i.sku || '').includes(q);
    })
    .filter(i => !onlyLow || isLow(i));
  const lowCount = items.filter(isLow).length;

  // Agrupa por produto (uma linha de várias variações fica muito mais fácil de escanear assim)
  const groups = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const item of filtered) {
      const key = item.productId || item.productName || item.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries())
      .map(([productId, list]) => ({ productId, productName: list[0]?.productName || productId, list }))
      .sort((a, b) => a.productName.localeCompare(b.productName));
  }, [filtered]);

  function baseLog(type: 'in' | 'out', quantity: number, reason: string): MovementLog {
    return {
      type, quantity, reason: reason.trim() || (type === 'out' ? 'Venda presencial (loja física)' : 'Reposição de estoque'),
      date: new Date().toISOString(),
      ...(user?.email ? { by: user.email } : {}),
    };
  }

  /** Reverte uma movimentação específica já conhecida (nunca "a última do item"
   *  buscada de novo depois -- isso evitaria desfazer a coisa errada se o
   *  histórico já tiver mudado). Nunca apaga/edita o histórico original,
   *  só lança o inverso, então a trilha de auditoria continua íntegra. */
  async function reverseMovement(itemId: string, log: MovementLog) {
    const reversedType = log.type === 'out' ? 'in' : 'out';
    try {
      await updateDoc(doc(db, 'inventory', itemId), {
        quantity: increment(reversedType === 'out' ? -log.quantity : log.quantity),
        history: arrayUnion(baseLog(reversedType, log.quantity, `Desfeito: ${log.reason}`)),
        updatedAt: serverTimestamp(),
      });
      showToast('Desfeito.');
    } catch (err) {
      console.error('[estoque] falha ao desfazer', err);
      showToast('Não deu pra desfazer — tenta de novo.');
    }
  }

  async function applyMovement(item: InventoryItem, type: 'in' | 'out', qty: number, reason: string) {
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (type === 'out') {
      const avail = available(item);
      if (qty > avail) {
        const ok = window.confirm(`Só tem ${avail} disponível pra venda, mas você está registrando ${qty}. O estoque vai ficar negativo. Continuar mesmo assim?`);
        if (!ok) return;
      }
    }
    setSubmittingId(item.id);
    const log = baseLog(type, qty, reason);
    try {
      await updateDoc(doc(db, 'inventory', item.id), {
        quantity: increment(type === 'out' ? -qty : qty),
        history: arrayUnion(log),
        updatedAt: serverTimestamp(),
      });
      setActionFor(null);
      showToast(type === 'out' ? 'Venda registrada.' : 'Entrada registrada.', () => reverseMovement(item.id, log));
    } catch (err) {
      console.error('[estoque] falha ao registrar movimentação', err);
      showToast('Não deu pra salvar — tenta de novo.');
    } finally {
      setSubmittingId(null);
    }
  }

  async function applyCorrection(item: InventoryItem, newQty: number, reason: string) {
    if (!Number.isFinite(newQty) || newQty < 0) return;
    const diff = newQty - item.quantity;
    if (diff === 0) { setActionFor(null); return; }
    setSubmittingId(item.id);
    const log = baseLog(diff > 0 ? 'in' : 'out', Math.abs(diff), reason || 'Correção manual de contagem');
    try {
      await updateDoc(doc(db, 'inventory', item.id), {
        quantity: newQty,
        history: arrayUnion(log),
        updatedAt: serverTimestamp(),
      });
      setActionFor(null);
      showToast('Estoque corrigido.', () => reverseMovement(item.id, log));
    } catch (err) {
      console.error('[estoque] falha ao corrigir', err);
      showToast('Não deu pra salvar — tenta de novo.');
    } finally {
      setSubmittingId(null);
    }
  }

  /** Desfaz só a última movimentação de um item, lançando o inverso dela —
   *  nunca apaga/edita o histórico existente, então a trilha de auditoria
   *  continua íntegra (dá pra ver que algo foi desfeito, e quando). */
  async function undoLast(item: InventoryItem) {
    const last = item.history?.[item.history.length - 1];
    if (!last) return;
    const ok = window.confirm(`Desfazer "${last.type === 'out' ? '−' : '+'}${last.quantity} · ${last.reason}"?`);
    if (!ok) return;
    setSubmittingId(item.id);
    try {
      await reverseMovement(item.id, last);
    } finally {
      setSubmittingId(null);
    }
  }

  function quickSale(item: InventoryItem) {
    applyMovement(item, 'out', 1, '');
  }
  function quickRestock(item: InventoryItem) {
    applyMovement(item, 'in', 1, '');
  }

  async function saveThreshold(item: InventoryItem, value: number) {
    if (!Number.isFinite(value) || value < 0 || value === item.lowStockThreshold) return;
    await updateDoc(doc(db, 'inventory', item.id), { lowStockThreshold: value });
  }

  const changedCount = useMemo(
    () => Object.entries(countDraft).filter(([id, v]) => {
      const item = items.find(i => i.id === id);
      return item && v !== item.quantity;
    }).length,
    [countDraft, items]
  );

  function enterCountMode() {
    setActionFor(null);
    setCountDraft({});
    setMode('contagem');
  }

  async function saveCount() {
    const bigJumps = items.filter(item => {
      const v = countDraft[item.id];
      return v !== undefined && Number.isFinite(v) && Math.abs(v - item.quantity) >= 50;
    });
    if (bigJumps.length > 0) {
      const ok = window.confirm(
        `${bigJumps.length === 1 ? 'Um item teve' : `${bigJumps.length} itens tiveram`} uma mudança de 50 unidades ou mais ` +
        `(ex: "${bigJumps[0].productName}" de ${bigJumps[0].quantity} para ${countDraft[bigJumps[0].id]}). ` +
        `Confere se não foi erro de digitação antes de continuar. Salvar mesmo assim?`
      );
      if (!ok) return;
    }
    setSavingCount(true);
    try {
      const batch = writeBatch(db);
      let changed = 0;
      for (const item of items) {
        const newQty = countDraft[item.id];
        if (newQty === undefined || !Number.isFinite(newQty) || newQty === item.quantity) continue;
        const diff = newQty - item.quantity;
        changed++;
        batch.update(doc(db, 'inventory', item.id), {
          quantity: newQty,
          history: arrayUnion(baseLog(diff > 0 ? 'in' : 'out', Math.abs(diff), 'Contagem geral do estoque')),
          updatedAt: serverTimestamp(),
        });
      }
      if (changed > 0) await batch.commit();
      showToast(changed > 0 ? `Contagem salva — ${changed} ${changed === 1 ? 'item atualizado' : 'itens atualizados'}.` : 'Nada mudou desde a última contagem.');
      setMode('dia');
    } catch (err) {
      console.error('[estoque] falha ao salvar contagem', err);
      showToast('Não deu pra salvar a contagem — tenta de novo.');
    } finally {
      setSavingCount(false);
    }
  }

  if (loading) return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-[72px] skeleton border border-mist" />)}
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display font-normal text-ink text-2xl">Estoque</h1>
          <p className="text-[13px] text-faint mt-1">
            {mode === 'contagem' ? 'Digite quantas peças você tem em mãos de cada item agora.'
              : subview === 'grade' ? 'Toque nas fotos abaixo pra registrar vendas e chegadas de mercadoria.'
              : 'Lista completa dos produtos, com correção de número e histórico de cada um.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'dia' && (
            <button onClick={() => setSubview(v => v === 'grade' ? 'lista' : 'grade')}
              className="border border-mist text-mid text-[11px] font-bold tracking-[0.08em] uppercase px-4 py-2.5 hover:bg-warm transition-colors">
              {subview === 'grade' ? 'Corrigir número de um item' : 'Voltar pras fotos'}
            </button>
          )}
          <Link href="/painel/estoque/historico"
            className="border border-mist text-mid text-[11px] font-bold tracking-[0.08em] uppercase px-4 py-2.5 hover:bg-warm transition-colors">
            Histórico geral
          </Link>
          {mode === 'dia' ? (
            <button onClick={enterCountMode}
              className="flex items-center gap-1.5 border border-ink text-ink text-[11px] font-bold tracking-[0.08em] uppercase px-4 py-2.5 hover:bg-ink hover:text-paper transition-colors">
              <IconListCheck size={13} /> Modo contagem
            </button>
          ) : (
            <button onClick={() => setMode('dia')}
              className="border border-mist text-mid text-[11px] font-bold tracking-[0.08em] uppercase px-4 py-2.5 hover:bg-warm transition-colors">
              Sair da contagem
            </button>
          )}
          <Link href="/painel/produtos/novo" className="shrink-0 bg-ink text-paper text-[11px] font-bold tracking-[0.1em] uppercase px-5 py-2.5 hover:bg-ink/80 transition-colors">
            + Produto
          </Link>
        </div>
      </div>

      {mode === 'dia' && subview === 'grade' && (
        <NovaVendaSheet
          embedded
          items={items}
          onDone={(msg, onUndo) => showToast(msg, onUndo)}
        />
      )}

      {mode === 'dia' && lowCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 px-4 py-3 mb-5 flex items-center gap-3">
          <IconAlert size={18} className="text-amber-600 shrink-0" />
          <p className="text-[13px] text-amber-800">
            <strong>{lowCount} {lowCount === 1 ? 'produto está' : 'produtos estão'} quase acabando!</strong>
            {' '}Verifique os itens destacados em amarelo abaixo e reabasteça o estoque.
          </p>
        </div>
      )}

      {mode === 'contagem' && (
        <div className="bg-blue-50 border border-blue-100 px-4 py-3 mb-5 text-[13px] text-blue-900">
          Percorra a lista e digite quantas peças você tem <strong>fisicamente em mãos agora</strong> de cada item
          (inclua as já vendidas no site que ainda não saíram pra entrega). Só o que você mudar vai ser salvo, e fica
          registrado no histórico de cada item.
        </div>
      )}

      {(mode === 'contagem' || subview === 'lista') && (
      <>
      {items.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="search" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-mist bg-paper pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20 focus:border-clay-l/40" />
          </div>
          {mode === 'dia' && lowCount > 0 && (
            <label className="shrink-0 flex items-center gap-1.5 text-[12px] text-mid cursor-pointer select-none border border-mist px-3 py-2.5 bg-paper">
              <input type="checkbox" checked={onlyLow} onChange={e => setOnlyLow(e.target.checked)} />
              Só acabando ({lowCount})
            </label>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border border-mist bg-paper py-16 text-center">
          <IconBox size={40} className="text-mist mx-auto mb-3" />
          <p className="text-sm text-faint">{search ? 'Nenhum resultado.' : 'Nenhum produto no estoque ainda.'}</p>
          {!search && <Link href="/painel/produtos/novo" className="mt-3 inline-block text-[12px] text-clay-l font-semibold">Adicionar produto</Link>}
        </div>
      ) : mode === 'contagem' ? (
        <div className="border border-mist bg-paper">
          {filtered.map((item, idx) => {
            const val = countDraft[item.id] ?? item.quantity;
            return (
              <div key={item.id} className={`flex items-center gap-2 px-4 py-2.5 ${idx !== 0 ? 'border-t border-mist' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink truncate">{item.productName}</p>
                  <p className="text-[11px] text-faint truncate">{variantLabel(item)}</p>
                </div>
                <div className="flex items-center shrink-0">
                  <button type="button" onClick={() => setCountDraft(d => ({ ...d, [item.id]: Math.max(0, val - 1) }))}
                    className="h-10 w-10 border border-mist bg-white dark:bg-warm text-mid font-bold text-lg flex items-center justify-center active:bg-warm">−</button>
                  <input type="number" min={0} inputMode="numeric" value={val}
                    onChange={e => setCountDraft(d => ({ ...d, [item.id]: Number(e.target.value) }))}
                    className="w-14 h-10 border-y border-mist bg-white dark:bg-warm text-center font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay-l/20" />
                  <button type="button" onClick={() => setCountDraft(d => ({ ...d, [item.id]: val + 1 }))}
                    className="h-10 w-10 border border-mist bg-white dark:bg-warm text-mid font-bold text-lg flex items-center justify-center active:bg-warm">+</button>
                </div>
              </div>
            );
          })}
          <div className="sticky bottom-4 flex justify-end px-4 py-3">
            <button onClick={saveCount} disabled={savingCount}
              className="bg-ink text-paper text-[12px] font-bold tracking-[0.05em] uppercase px-6 py-3 shadow-lg hover:bg-ink/80 transition-colors disabled:opacity-50">
              {savingCount ? 'Salvando...' : `Salvar contagem${changedCount > 0 ? ` (${changedCount})` : ''}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.productId}>
              <div className="flex items-baseline justify-between mb-2 px-0.5">
                <p className="text-[13px] font-bold text-ink">{group.productName}</p>
                <p className="text-[11px] text-faint">
                  {group.list.length} {group.list.length === 1 ? 'variação' : 'variações'} · {group.list.reduce((s, i) => s + available(i), 0)} un. disponíveis
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                {group.list.map((item) => {
            const low = isLow(item);
            const avail = available(item);
            const action = actionFor?.id === item.id ? actionFor.kind : null;
            const threshold = thresholdDraft[item.id] ?? item.lowStockThreshold;
            const history = [...(item.history || [])].reverse().slice(0, 10);
            const expanded = expandedId === item.id;
            const busy = submittingId === item.id;
            return (
              <div key={item.id} className={`border ${low ? 'border-amber-200 bg-amber-50' : 'border-mist bg-paper'}`}>
                {/* Linha compacta -- sempre visível, pensada pra polegar */}
                <button onClick={() => setExpandedId(e => e === item.id ? null : item.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink truncate">{item.productName}</p>
                    <p className="text-[11.5px] text-faint truncate">{variantLabel(item)}</p>
                  </div>
                  {low && <IconAlert size={16} className="text-amber-600 shrink-0" />}
                  <div className="text-right shrink-0 leading-none">
                    <p className={`text-xl font-bold ${low ? 'text-amber-600' : 'text-ink'}`}>{avail}</p>
                    <p className="text-[9px] text-faint mt-0.5">disponível</p>
                  </div>
                  <svg className={`shrink-0 text-faint transition-transform ${expanded ? 'rotate-180' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                {/* Ações rápidas -- 1 toque cobre o caso mais comum (vender/repor 1 unidade) */}
                <div className="flex gap-2 px-4 pb-3">
                  <button onClick={() => quickSale(item)} disabled={busy}
                    className="flex-1 h-11 bg-ink text-paper text-[13px] font-bold hover:bg-ink/80 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                    <IconMinusCircle size={15} /> Vendi 1
                  </button>
                  <button onClick={() => quickRestock(item)} disabled={busy}
                    className="h-11 w-11 shrink-0 border border-mist text-mid hover:bg-warm transition-colors flex items-center justify-center disabled:opacity-50" aria-label="Chegou 1 unidade">
                    <IconPlusCircle size={17} />
                  </button>
                  <button onClick={() => setExpandedId(item.id)} disabled={busy}
                    className="h-11 px-3 shrink-0 border border-mist text-mid text-[12px] font-semibold hover:bg-warm transition-colors disabled:opacity-50">
                    Outra qtd. / mais
                  </button>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-dashed border-mist pt-3.5 flex flex-col gap-3.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center bg-white dark:bg-warm border border-mist px-3 py-2.5">
                        <p className="text-[9.5px] font-bold uppercase tracking-wide text-faint mb-1">Reservado (pedidos)</p>
                        <p className="text-lg font-bold text-mid">{item.reserved}</p>
                      </div>
                      <div className="text-center bg-white dark:bg-warm border border-mist px-3 py-2.5">
                        <p className="text-[9.5px] font-bold uppercase tracking-wide text-faint mb-1">Avisar quando restar</p>
                        <input type="number" min={0} inputMode="numeric" value={threshold}
                          onChange={ev => setThresholdDraft(d => ({ ...d, [item.id]: Number(ev.target.value) }))}
                          onBlur={ev => saveThreshold(item, Number(ev.target.value))}
                          className="w-full bg-transparent border-none text-center text-lg font-bold text-mid py-0 focus:outline-none" />
                      </div>
                    </div>

                    {action ? (
                      <InlineActionForm
                        item={item}
                        kind={action}
                        available={avail}
                        submitting={busy}
                        onCancel={() => setActionFor(null)}
                        onConfirm={(qty, note) => {
                          if (action === 'venda') applyMovement(item, 'out', qty, note);
                          else if (action === 'entrada') applyMovement(item, 'in', qty, note);
                          else applyCorrection(item, qty, note);
                        }}
                      />
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => setActionFor({ id: item.id, kind: 'venda' })} disabled={busy}
                          className="flex-1 border border-mist text-mid text-[12px] font-semibold py-2.5 hover:bg-warm transition-colors disabled:opacity-50">
                          Vender + de 1
                        </button>
                        <button onClick={() => setActionFor({ id: item.id, kind: 'entrada' })} disabled={busy}
                          className="flex-1 border border-mist text-mid text-[12px] font-semibold py-2.5 hover:bg-warm transition-colors disabled:opacity-50">
                          Entrada + de 1
                        </button>
                        <button onClick={() => setActionFor({ id: item.id, kind: 'correcao' })} disabled={busy}
                          className="flex-1 border border-mist text-mid text-[12px] font-semibold py-2.5 hover:bg-warm transition-colors disabled:opacity-50">
                          Corrigir número
                        </button>
                      </div>
                    )}

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-faint mb-1.5">
                        Histórico{item.history?.length ? ` (${item.history.length})` : ''}
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {history.length === 0 ? (
                          <p className="text-[11px] text-faint">Nenhuma movimentação registrada ainda.</p>
                        ) : history.map((m, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px]">
                            <span className={m.type === 'out' ? 'text-red-600' : 'text-emerald-700'}>
                              {m.type === 'out' ? '−' : '+'}{m.quantity} · {m.reason}{m.by ? ` (${m.by})` : ''}
                            </span>
                            <span className="text-faint shrink-0 ml-2 flex items-center gap-2">
                              {timeAgo(m.date)}
                              {i === 0 && (
                                <button onClick={() => undoLast(item)} disabled={busy}
                                  className="text-red-500 underline disabled:opacity-50">
                                  Desfazer
                                </button>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto bg-ink text-paper text-[13px] font-semibold px-5 py-3 shadow-lg flex items-center gap-3 z-50">
          <IconCheck size={14} className="shrink-0" />
          <span className="flex-1">{toast.msg}</span>
          {toast.onUndo && (
            <button onClick={() => { toast.onUndo!(); setToast(null); }} className="shrink-0 underline decoration-white/50 hover:decoration-white">
              Desfazer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InlineActionForm({ item, kind, available, submitting, onCancel, onConfirm }: {
  item: InventoryItem; kind: 'venda' | 'entrada' | 'correcao'; available: number; submitting: boolean;
  onCancel: () => void; onConfirm: (qty: number, note: string) => void;
}) {
  const [qty, setQty] = useState(kind === 'correcao' ? item.quantity : 1);
  const [note, setNote] = useState('');
  const title = kind === 'venda' ? 'Registrar venda na loja física'
    : kind === 'entrada' ? 'Registrar chegada de mercadoria'
    : 'Corrigir número após contagem';
  const qtyLabel = kind === 'correcao' ? 'Quantidade total real (contando)' : 'Quantidade';
  const placeholder = kind === 'venda' ? 'Ex: cliente do bairro (opcional)'
    : kind === 'entrada' ? 'Ex: reposição do fornecedor (opcional)'
    : 'Ex: recontagem de terça-feira (opcional)';

  return (
    <div className="border border-clay-l/30 bg-white dark:bg-warm p-3 flex flex-col gap-2.5">
      <p className="text-[12px] font-bold text-ink">{title}</p>
      <div className="flex gap-2">
        <div className="w-24 shrink-0">
          <label className="block text-[10px] font-semibold text-mid mb-1">{qtyLabel}</label>
          <input type="number" min={0} inputMode="numeric" value={qty} autoFocus disabled={submitting}
            onChange={e => setQty(Number(e.target.value))}
            className="w-full border border-clay-l/40 text-center py-2 font-bold focus:outline-none disabled:opacity-50" />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] font-semibold text-mid mb-1">Observação</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={placeholder} disabled={submitting}
            className="w-full border border-mist px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20 disabled:opacity-50" />
        </div>
      </div>
      {kind !== 'correcao' && (
        <p className="text-[11px] text-faint">Disponível hoje: {available} unidade{available === 1 ? '' : 's'}</p>
      )}
      <div className="flex gap-2 mt-0.5">
        <button onClick={() => onConfirm(qty, note)} disabled={submitting}
          className="flex-1 bg-ink text-paper text-[12px] font-bold py-2.5 hover:bg-ink/80 transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
          <IconCheck size={12} /> {submitting ? 'Salvando...' : 'Confirmar'}
        </button>
        <button onClick={onCancel} disabled={submitting} className="flex-1 border border-mist text-mid text-[12px] font-semibold py-2.5 hover:bg-warm transition-colors disabled:opacity-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}
