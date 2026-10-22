'use client';
import { plural } from '@/lib/plural';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { IconAlert, IconBox, IconCheck, IconMinusCircle, IconPlusCircle, IconListCheck, IconEdit, IconImage, IconClock, IconX } from '@/components/ui/Icon';
import { InventoryAuditPanel } from '@/components/painel/InventoryAuditPanel';
import { PanelErrorState } from '@/components/painel/PanelErrorState';
import { NovaVendaSheet } from '@/components/painel/NovaVendaSheet';

import { useEffect, useId, useMemo, useState, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, getDoc, getDocs, query, where, increment, arrayUnion, serverTimestamp, writeBatch } from 'firebase/firestore';
import { expandStockLines } from '@/lib/orderStockLines';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';
import { staffActor } from '@/lib/staffActor';
import { variantLabel as variantLabelOf } from '@/lib/variantLabel';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import { ORDER_STOCK_SOURCE_LABEL, type OrderStockSource } from '@/lib/stockHistory';

type MovementLog = { type: 'in' | 'out' | 'adjust'; quantity: number; reason: string; date: string; by?: string; saleId?: string; source?: OrderStockSource };
type InventoryItem = {
  id: string; productId: string; productName?: string; sku: string;
  variant: { size: string; fabric: string; color: string; colorName?: string };
  quantity: number; reserved: number; lowStockThreshold: number; history?: MovementLog[];
};

function normalize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function variantLabel(item: InventoryItem) {
  return variantLabelOf(item.variant);
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

  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // O callback é async e busca o nome de cada produto; sem o try/catch,
    // uma busca que falhasse rejeitava a promise do callback e
    // setLoading(false) nunca rodava, ficando no esqueleto pra sempre.
    // Mesmo bug corrigido antes em estoque/historico.
    const unsub = onSnapshot(
      collection(db, 'inventory'),
      async (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryItem));
        try {
          const uncachedIds = Array.from(new Set(data.map((i) => i.productId))).filter((id) => !nameCache.current[id]);
          if (uncachedIds.length > 0) {
            await Promise.all(uncachedIds.map(async (pid) => {
              const pdoc = await getDoc(doc(db, 'products', pid));
              nameCache.current[pid] = pdoc.exists() ? (pdoc.data().name as string) : pid;
            }));
          }
        } catch (err) {
          console.error('[estoque] nomes de produto:', err);
        }
        setItems(data.map((i) => ({ ...i, productName: nameCache.current[i.productId] ?? i.productId }))
          .sort((a, b) => (a.productName || '').localeCompare(b.productName || '')));
        setLoadError(false);
        setLoading(false);
      },
      (err) => { console.error('[estoque] onSnapshot:', err); setLoadError(true); setLoading(false); }
    );
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
  const lowItems = items.filter(isLow);
  const lowProductNames = Array.from(new Set(lowItems.map(i => i.productName || i.productId)));
  const lowNames = lowProductNames.slice(0, 2).join(', ')
    + (lowProductNames.length > 2 ? ` e mais ${lowProductNames.length - 2}` : '');

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
      by: staffActor(user),
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
      showToast('Não deu pra desfazer, tenta de novo.');
    }
  }

  async function applyMovement(item: InventoryItem, type: 'in' | 'out', qty: number, reason: string) {
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (type === 'out') {
      const avail = available(item);
      if (qty > avail) {
        const { confirmed } = await confirmDialog({
          message: `Só tem ${avail} disponível pra venda`,
          detail: `Você está registrando ${qty}. O estoque vai ficar negativo. Continuar mesmo assim?`,
          confirmLabel: 'Continuar',
          variant: 'danger',
        });
        if (!confirmed) return;
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
      showToast('Não deu pra salvar, tenta de novo.');
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
      // Grava a diferença em relação ao que estava na tela, não o valor
      // absoluto: um pagamento confirmado entre abrir o formulário e salvar
      // já debitou a peça, e o valor absoluto apagava esse débito.
      await updateDoc(doc(db, 'inventory', item.id), {
        quantity: increment(diff),
        history: arrayUnion(log),
        updatedAt: serverTimestamp(),
      });
      setActionFor(null);
      showToast('Estoque corrigido.', () => reverseMovement(item.id, log));
    } catch (err) {
      console.error('[estoque] falha ao corrigir', err);
      showToast('Não deu pra salvar, tenta de novo.');
    } finally {
      setSubmittingId(null);
    }
  }

  /** Desfaz só a última movimentação de um item, lançando o inverso dela -
   *  nunca apaga/edita o histórico existente, então a trilha de auditoria
   *  continua íntegra (dá pra ver que algo foi desfeito, e quando). */
  async function undoLast(item: InventoryItem) {
    // Última movimentação de peças: correções de reserva da auditoria
    // ('adjust') não se desfazem por aqui.
    // Movimentações de pedido (venda online, cancelamento) também ficam de
    // fora: desfazê-las aqui deixaria o estoque diferente do pedido.
    const last = [...(item.history ?? [])].reverse().find(m => (m.type === 'in' || m.type === 'out') && !m.source);
    if (!last) return;
    const { confirmed } = await confirmDialog({
      message: `Desfazer "${last.type === 'out' ? '−' : '+'}${last.quantity} · ${last.reason}"?`,
      confirmLabel: 'Desfazer',
    });
    if (!confirmed) return;
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

  // Contagem em andamento se perdia ao tocar em outra aba do painel.
  useUnsavedGuard(mode === 'contagem' && changedCount > 0 && !savingCount, {
    message: 'Sair sem salvar a contagem?',
    detail: `${changedCount} ${changedCount === 1 ? 'item contado ainda não foi salvo' : 'itens contados ainda não foram salvos'}.`,
  });

  async function exitCountMode() {
    if (changedCount > 0) {
      const { confirmed } = await confirmDialog({
        message: 'Sair da contagem sem salvar?',
        detail: `${changedCount} ${changedCount === 1 ? 'item contado vai' : 'itens contados vão'} se perder.`,
        confirmLabel: 'Sair sem salvar',
        cancelLabel: 'Continuar contando',
        variant: 'danger',
      });
      if (!confirmed) return;
    }
    setCountDraft({});
    setMode('dia');
  }

  function enterCountMode() {
    setActionFor(null);
    setCountDraft({});
    setMode('contagem');
  }

  // Peças de pedidos pagos/em separação ainda estão na prateleira, mas já
  // saíram do estoque do site (são descontadas no pagamento). A contagem
  // física inclui essas peças, então elas são descontadas aqui: antes iam
  // direto pro estoque e o site vendia de novo o que já estava vendido.
  async function loadCommitted(): Promise<Record<string, number>> {
    const snap = await getDocs(query(collection(db, 'orders'), where('status', 'in', ['paid', 'preparing'])));
    const out: Record<string, number> = {};
    for (const d of snap.docs) {
      const lines = expandStockLines((d.data().items ?? []) as Parameters<typeof expandStockLines>[0]);
      for (const line of lines) out[line.sku] = (out[line.sku] ?? 0) + line.quantity;
    }
    return out;
  }

  // Trava desde o primeiro toque: a leitura dos pedidos e o confirm vêm
  // antes do setSavingCount, e um toque duplo nesse meio tempo gravava a
  // contagem duas vezes (histórico com movimentações em dobro).
  const savingCountRef = useRef(false);
  async function saveCount() {
    if (savingCountRef.current) return;
    savingCountRef.current = true;
    try { await saveCountInner(); } finally { savingCountRef.current = false; }
  }

  async function saveCountInner() {
    let committed: Record<string, number>;
    try {
      committed = await loadCommitted();
    } catch (err) {
      console.error('[estoque] falha ao ler pedidos pagos', err);
      showToast('Não deu pra conferir os pedidos pagos agora, tenta de novo.');
      return;
    }
    const target = (item: { id: string }) => {
      const shelf = countDraft[item.id];
      if (shelf === undefined || !Number.isFinite(shelf)) return undefined;
      return Math.max(0, shelf - (committed[item.id] ?? 0));
    };
    const bigJumps = items.filter(item => {
      const v = target(item);
      return v !== undefined && Math.abs(v - item.quantity) >= 50;
    });
    if (bigJumps.length > 0) {
      const { confirmed } = await confirmDialog({
        message: `${bigJumps.length === 1 ? 'Um item teve' : `${bigJumps.length} itens tiveram`} uma mudança de 50 unidades ou mais`,
        detail: `Ex: "${bigJumps[0].productName}" de ${bigJumps[0].quantity} para ${target(bigJumps[0])}. Confere se não foi erro de digitação. Salvar mesmo assim?`,
        confirmLabel: 'Salvar mesmo assim',
        variant: 'danger',
      });
      if (!confirmed) return;
    }
    setSavingCount(true);
    try {
      const batch = writeBatch(db);
      let changed = 0;
      for (const item of items) {
        const newQty = target(item);
        if (newQty === undefined || newQty === item.quantity) continue;
        const diff = newQty - item.quantity;
        changed++;
        // Diferença, não valor absoluto: um pagamento confirmado entre a
        // leitura dos pedidos e o commit já debitou a peça; gravar newQty
        // apagava esse débito e criava estoque fantasma.
        batch.update(doc(db, 'inventory', item.id), {
          quantity: increment(diff),
          history: arrayUnion(baseLog(diff > 0 ? 'in' : 'out', Math.abs(diff), 'Contagem geral do estoque')),
          updatedAt: serverTimestamp(),
        });
      }
      if (changed > 0) await batch.commit();
      showToast(changed > 0 ? `Contagem salva, ${changed} ${changed === 1 ? 'item atualizado' : 'itens atualizados'}.` : 'Nada mudou desde a última contagem.');
      setMode('dia');
    } catch (err) {
      console.error('[estoque] falha ao salvar contagem', err);
      showToast('Não deu pra salvar a contagem, tenta de novo.');
    } finally {
      setSavingCount(false);
    }
  }

  if (loading) return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-[72px] skeleton rounded-xl" />)}
    </div>
  );
  if (loadError) return (
    <div className="max-w-6xl mx-auto">
      <PanelErrorState message="Não foi possível carregar o estoque." />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 mb-6">
        <div>
          <h1 className="sr-only lg:not-sr-only font-display font-normal text-ink text-2xl">Estoque</h1>
          <p className="text-[13px] text-faint mt-1">
            {mode === 'contagem' ? 'Digite quantas peças você tem em mãos de cada item agora.'
              : subview === 'grade' ? 'Toque nas fotos abaixo pra registrar vendas e chegadas de mercadoria.'
              : 'Lista completa dos produtos, com correção de número e histórico de cada um.'}
          </p>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
          {/* Grade de colunas iguais: em 390px a fileira rolava de lado e
              "Modo contagem" aparecia cortado como "Modo". */}
          <div className={`grid ${mode === 'dia' ? 'grid-cols-3' : 'grid-cols-2'} border border-mist bg-white dark:bg-warm text-[12.5px] font-semibold text-mid divide-x divide-mist overflow-hidden rounded-xl lg:flex lg:items-center`}>
            {mode === 'dia' && (
              <button onClick={() => setSubview(v => v === 'grade' ? 'lista' : 'grade')}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2.5 hover:bg-warm hover:text-ink transition-colors text-center leading-tight">
                {subview === 'grade' ? (
                  <><IconEdit size={13} /> <span><span className="sm:hidden">Corrigir</span><span className="hidden sm:inline">Corrigir número</span></span></>
                ) : (
                  <><IconImage size={13} /> Ver fotos</>
                )}
              </button>
            )}
            <Link href="/painel/estoque/historico"
              className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2.5 hover:bg-warm hover:text-ink transition-colors text-center leading-tight">
              <IconClock size={13} /> <span><span className="sm:hidden">Histórico</span><span className="hidden sm:inline">Histórico geral</span></span>
            </Link>
            {mode === 'dia' ? (
              <button onClick={enterCountMode}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2.5 hover:bg-warm hover:text-ink transition-colors text-center leading-tight">
                <IconListCheck size={13} /> <span><span className="sm:hidden">Contagem</span><span className="hidden sm:inline">Modo contagem</span></span>
              </button>
            ) : (
              <button onClick={exitCountMode}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-ink text-paper font-bold whitespace-nowrap">
                <IconX size={13} /> Sair da contagem
              </button>
            )}
          </div>
          <Link href="/painel/produtos/novo"
            className="hidden lg:flex lg:w-auto shrink-0 items-center justify-center gap-1.5 h-10 bg-ink text-paper text-[13px] font-semibold px-5 hover:bg-ink/80 transition-colors rounded-full">
            <span aria-hidden="true" className="text-[16px] leading-none">+</span> Novo produto
          </Link>
        </div>
      </div>

      {/* Aviso de estoque baixo ANTES da grade, com os nomes e um atalho pra
          lista filtrada: antes ficava no fim da página dizendo "destacados em
          amarelo abaixo", mas a grade de fotos não destaca nada. */}
      {mode === 'dia' && lowCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 px-4 py-3 mb-5 flex items-start sm:items-center gap-3 rounded-xl">
          <IconAlert size={18} className="text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
          <p className="text-[13px] text-amber-800 flex-1 min-w-0">
            <strong>{lowCount} {lowCount === 1 ? 'item está' : 'itens estão'} quase acabando:</strong>
            {' '}{lowNames}
          </p>
          {!(subview === 'lista' && onlyLow) && (
            <button type="button" onClick={() => { setSubview('lista'); setOnlyLow(true); }}
              className="shrink-0 inline-flex items-center min-h-10 px-2 -my-2 -mr-2 text-[12px] font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900 transition-colors">
              Ver
            </button>
          )}
        </div>
      )}

      {mode === 'dia' && subview === 'grade' && (
        <NovaVendaSheet
          embedded
          items={items}
          onDone={(msg, onUndo) => showToast(msg, onUndo)}
        />
      )}

      {mode === 'dia' && <InventoryAuditPanel />}


      {mode === 'contagem' && (
        <div className="bg-blue-50 border border-blue-100 px-4 py-3 mb-5 text-[13px] text-blue-900 rounded-xl">
          Percorra a lista e digite quantas peças você tem <strong>fisicamente em mãos agora</strong> de cada item
          (inclua as separadas pra pedidos já pagos: o sistema desconta essas peças sozinho ao salvar). Só o que
          você mudar vai ser salvo, e fica registrado no histórico de cada item.
        </div>
      )}

      {(mode === 'contagem' || subview === 'lista') && (
      <>
      {items.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="search" placeholder="Buscar produto..." aria-label="Buscar produto" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-mist bg-paper pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20 focus:border-clay-l/40 rounded-xl" />
          </div>
          {mode === 'dia' && lowCount > 0 && (
            <label className="shrink-0 flex items-center gap-1.5 text-[12px] text-mid cursor-pointer select-none border border-mist px-3 py-2.5 bg-paper rounded-xl">
              <input type="checkbox" checked={onlyLow} onChange={e => setOnlyLow(e.target.checked)} />
              Só acabando ({lowCount})
            </label>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border border-mist bg-paper py-16 text-center rounded-xl">
          <IconBox size={40} className="text-mist mx-auto mb-3" />
          <p className="text-sm text-faint">{search ? 'Nenhum resultado.' : 'Nenhum produto no estoque ainda.'}</p>
          {!search && <Link href="/painel/produtos/novo" className="mt-3 inline-block text-[12px] text-clay font-semibold">Adicionar produto</Link>}
        </div>
      ) : mode === 'contagem' ? (
        <div className="border border-mist bg-paper rounded-xl">
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
                    className="h-10 w-10 border border-mist bg-white dark:bg-warm text-mid font-bold text-lg flex items-center justify-center active:bg-warm rounded-xl">−</button>
                  <input type="number" min={0} inputMode="numeric" value={val}
                    aria-label={`Quantidade em mãos de ${item.productName}, ${variantLabel(item)}`}
                    onChange={e => setCountDraft(d => ({ ...d, [item.id]: Number(e.target.value) }))}
                    className="w-14 h-10 border-y border-mist bg-white dark:bg-warm text-center font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay-l/20" />
                  <button type="button" onClick={() => setCountDraft(d => ({ ...d, [item.id]: val + 1 }))}
                    className="h-10 w-10 border border-mist bg-white dark:bg-warm text-mid font-bold text-lg flex items-center justify-center active:bg-warm rounded-xl">+</button>
                </div>
              </div>
            );
          })}
          {/* above-panel-tabbar: no celular fica acima da barra de baixo
              (antes "sticky bottom-4" nunca grudava, o main rolava junto). */}
          <div className="sticky above-panel-tabbar z-10 flex justify-end px-4 py-3 pointer-events-none [&>*]:pointer-events-auto">
            <button onClick={saveCount} disabled={savingCount}
              className="bg-ink text-paper text-[13px] font-semibold px-6 h-12 shadow-lg hover:bg-ink/80 transition-colors disabled:opacity-50 rounded-full">
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
                  {group.list.length} {group.list.length === 1 ? 'variação' : 'variações'} · {(() => { const n = group.list.reduce((s, i) => s + available(i), 0); return plural(n, 'unidade disponível', 'unidades disponíveis'); })()}
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
                  <svg aria-hidden="true" className={`shrink-0 text-faint transition-transform ${expanded ? 'rotate-180' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                {/* Ações rápidas -- 1 toque cobre o caso mais comum (vender/repor 1 unidade) */}
                <div className="flex gap-2 px-4 pb-3">
                  <button onClick={() => quickSale(item)} disabled={busy}
                    className="flex-1 h-11 bg-ink text-paper text-[13px] font-bold hover:bg-ink/80 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                    <IconMinusCircle size={15} /> Vendi 1
                  </button>
                  <button onClick={() => quickRestock(item)} disabled={busy}
                    className="h-11 w-11 shrink-0 border border-mist text-mid hover:bg-warm transition-colors flex items-center justify-center disabled:opacity-50 rounded-xl" aria-label="Chegou 1 unidade">
                    <IconPlusCircle size={17} />
                  </button>
                  <button onClick={() => setExpandedId(item.id)} disabled={busy}
                    className="h-11 px-3 shrink-0 border border-mist text-mid text-[12px] font-semibold hover:bg-warm transition-colors disabled:opacity-50 rounded-xl">
                    Outra qtd. / mais
                  </button>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-dashed border-mist pt-3.5 flex flex-col gap-3.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center bg-white dark:bg-warm border border-mist px-3 py-2.5 rounded-xl">
                        <p className="text-[9.5px] font-bold uppercase tracking-wide text-faint mb-1">Reservado (pedidos)</p>
                        <p className="text-lg font-bold text-mid">{item.reserved}</p>
                      </div>
                      <div className="text-center bg-white dark:bg-warm border border-mist px-3 py-2.5 rounded-xl">
                        <p className="text-[9.5px] font-bold uppercase tracking-wide text-faint mb-1">Avisar quando restar</p>
                        <input type="number" min={0} inputMode="numeric" value={threshold}
                          aria-label={`Avisar quando restar, ${item.productName}, ${variantLabel(item)}`}
                          onChange={ev => setThresholdDraft(d => ({ ...d, [item.id]: Number(ev.target.value) }))}
                          onBlur={ev => saveThreshold(item, Number(ev.target.value))}
                          className="w-full bg-transparent border-none text-center text-lg font-bold text-mid py-0 focus:outline-none rounded-xl" />
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
                          className="flex-1 border border-mist text-mid text-[12px] font-semibold py-2.5 hover:bg-warm transition-colors disabled:opacity-50 rounded-xl">
                          Vender + de 1
                        </button>
                        <button onClick={() => setActionFor({ id: item.id, kind: 'entrada' })} disabled={busy}
                          className="flex-1 border border-mist text-mid text-[12px] font-semibold py-2.5 hover:bg-warm transition-colors disabled:opacity-50 rounded-xl">
                          Entrada + de 1
                        </button>
                        <button onClick={() => setActionFor({ id: item.id, kind: 'correcao' })} disabled={busy}
                          className="flex-1 border border-mist text-mid text-[12px] font-semibold py-2.5 hover:bg-warm transition-colors disabled:opacity-50 rounded-xl">
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
                            <span className={m.type === 'out' ? 'text-red-600' : m.type === 'adjust' ? 'text-faint' : 'text-emerald-700'}>
                              {m.type === 'out' ? '−' : m.type === 'adjust' ? '±' : '+'}{m.quantity} · {m.source ? `${ORDER_STOCK_SOURCE_LABEL[m.source]} · ` : ''}{m.reason}{m.by ? ` (${m.by})` : ''}
                            </span>
                            <span className="text-faint shrink-0 ml-2 flex items-center gap-2">
                              {timeAgo(m.date)}
                              {i === 0 && m.type !== 'adjust' && !m.source && (
                                <button onClick={() => undoLast(item)} disabled={busy}
                                  className="text-red-700 underline disabled:opacity-50">
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
        <div className="fixed above-panel-tabbar-toast left-4 right-4 sm:left-auto sm:right-6 sm:w-auto bg-ink text-paper text-[13px] font-semibold px-5 py-3 shadow-lg flex items-center gap-3 z-50 rounded-lg">
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
  const qtyId = useId();
  const noteId = useId();
  const title = kind === 'venda' ? 'Registrar venda na loja física'
    : kind === 'entrada' ? 'Registrar chegada de mercadoria'
    : 'Corrigir número após contagem';
  const qtyLabel = kind === 'correcao' ? 'Quantidade total real (contando)' : 'Quantidade';
  const placeholder = kind === 'venda' ? 'Ex: cliente do bairro (opcional)'
    : kind === 'entrada' ? 'Ex: reposição do fornecedor (opcional)'
    : 'Ex: recontagem de terça-feira (opcional)';

  return (
    <div className="border border-clay-l/30 bg-white dark:bg-warm p-3 flex flex-col gap-2.5 rounded-xl">
      <p className="text-[12px] font-bold text-ink">{title}</p>
      <div className="flex gap-2">
        <div className="w-24 shrink-0">
          <label htmlFor={qtyId} className="block text-[10px] font-semibold text-mid mb-1">{qtyLabel}</label>
          <input id={qtyId} type="number" min={0} inputMode="numeric" value={qty} autoFocus disabled={submitting}
            onChange={e => setQty(Number(e.target.value))}
            className="w-full border border-clay-l/40 text-center py-2 font-bold focus:outline-none disabled:opacity-50 rounded-xl" />
        </div>
        <div className="flex-1">
          <label htmlFor={noteId} className="block text-[10px] font-semibold text-mid mb-1">Observação</label>
          <input id={noteId} type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={placeholder} disabled={submitting}
            className="w-full border border-mist px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay-l/20 disabled:opacity-50 rounded-xl" />
        </div>
      </div>
      {kind !== 'correcao' && (
        <p className="text-[11px] text-faint">Disponível hoje: {available} unidade{available === 1 ? '' : 's'}</p>
      )}
      <div className="flex gap-2 mt-0.5">
        <button onClick={() => onConfirm(qty, note)} disabled={submitting}
          className="flex-1 bg-ink text-paper text-[12px] font-bold py-2.5 hover:bg-ink/80 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 rounded-xl">
          <IconCheck size={12} /> {submitting ? 'Salvando...' : 'Confirmar'}
        </button>
        <button onClick={onCancel} disabled={submitting} className="flex-1 border border-mist text-mid text-[12px] font-semibold py-2.5 hover:bg-warm transition-colors disabled:opacity-50 rounded-xl">
          Cancelar
        </button>
      </div>
    </div>
  );
}
