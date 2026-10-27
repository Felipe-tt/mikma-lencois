'use client';
import { plural } from '@/lib/plural';
import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, writeBatch, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { useAuth } from '@/lib/auth/AuthContext';
import { IconBox, IconCheck, IconX, IconSearch, IconReceipt, IconMinusCircle, IconPlusCircle } from '@/components/ui/Icon';
import { variantLabel as variantLabelOf } from '@/lib/variantLabel';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import type { MovementLog } from '@/types';
import { nextTapDelta, shouldConfirmRapidTap, applyTapDelta } from '@/lib/inventoryTap';
import { useFullscreenOverlay } from '@/lib/hooks/useFullscreenOverlay';
import { useOverlayBehavior } from '@/lib/hooks/useOverlay';
import { staffActor } from '@/lib/staffActor';

export type InventoryItem = {
  id: string; productId: string; productName?: string; sku: string;
  variant: { size: string; fabric: string; color: string; colorName?: string };
  quantity: number; reserved: number; lowStockThreshold: number; history?: MovementLog[];
};

// No celular 4 colunas deixavam a foto pequena demais pra acertar o toque.
const COL_OPTIONS_MOBILE = [2, 3];
const COL_OPTIONS_DESKTOP = [3, 4, 5, 6, 8];
const COLS_KEY = 'mikma_estoque_grid_cols';

function normalize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function variantLabel(item: InventoryItem) {
  return variantLabelOf(item.variant);
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
  const viewportHeight = useFullscreenOverlay(!embedded);
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayBehavior({ active: !embedded, onClose: () => onClose?.(), panelRef });
  // Em tela pequena, 5-6 colunas deixam a foto minúscula e difícil de tocar
  // certo, por isso o conjunto de opções (e o padrão) muda conforme o
  // tamanho da tela, em vez de oferecer sempre as mesmas 3-6 colunas.
  const [isMobile, setIsMobile] = useState(true);
  const [cols, setCols] = useState(2);
  const [search, setSearch] = useState('');
  const [deltas, setDeltas] = useState<Record<string, number>>({}); // negativo = venda, positivo = reposição
  const [images, setImages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    function applyForViewport(mobile: boolean) {
      setIsMobile(mobile);
      const options = mobile ? COL_OPTIONS_MOBILE : COL_OPTIONS_DESKTOP;
      const saved = Number(window.localStorage.getItem(COLS_KEY));
      setCols(options.includes(saved) ? saved : (mobile ? 2 : 4));
    }
    applyForViewport(!mq.matches);
    const onChange = (e: MediaQueryListEvent) => applyForViewport(!e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
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

  function vibrate(pattern: number | number[]) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
  }

  async function tap(item: InventoryItem) {
    const cur = deltas[item.id] || 0;
    const next = nextTapDelta(mode, cur);

    if (shouldConfirmRapidTap(cur, next)) {
      vibrate([20, 60, 20]);
      const { confirmed } = await confirmDialog({
        message: `${Math.abs(next)} toques seguidos em "${item.productName}"`,
        detail: `Confere se não foi sem querer. Continuar como ${mode === 'venda' ? plural(Math.abs(next), 'venda', 'vendas') : plural(Math.abs(next), 'chegada', 'chegadas')}?`,
        confirmLabel: 'Continuar',
      });
      if (!confirmed) return;
    } else {
      vibrate(15);
    }

    setDeltas(d => applyTapDelta(d, item.id, next));
  }

  const soldToday = useMemo(() => {
    const todayStr = new Date().toDateString();
    return items.reduce((sum, item) => {
      const logs = item.history || [];
      const todayOut = logs
        .filter(l => l.type === 'out' && new Date(l.date).toDateString() === todayStr)
        .reduce((s, l) => s + l.quantity, 0);
      return sum + todayOut;
    }, 0);
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = normalize(search);
    return items.filter(i => normalize(i.productName || '').includes(q) || normalize(variantLabel(i)).includes(q) || normalize(i.sku || '').includes(q));
  }, [items, search]);

  const pendingEntries = Object.entries(deltas).filter(([, d]) => d !== 0);
  const pendingCount = pendingEntries.length;
  const pendingUnits = pendingEntries.reduce((s, [, d]) => s + Math.abs(d), 0);
  // Toques marcados e não confirmados se perdiam ao trocar de aba.
  useUnsavedGuard(embedded && pendingCount > 0 && !saving, {
    message: 'Sair sem confirmar?',
    detail: `${pendingCount} ${pendingCount === 1 ? 'produto marcado ainda não foi salvo' : 'produtos marcados ainda não foram salvos'}.`,
  });

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
      const { confirmed } = await confirmDialog({
        message: `${overAvail.length === 1 ? 'Um item vai ficar' : `${overAvail.length} itens vão ficar`} negativo no estoque`,
        detail: `Ex: "${overAvail[0].item.productName} · ${variantLabel(overAvail[0].item)}". Confere antes de continuar. Salvar mesmo assim?`,
        confirmLabel: 'Salvar mesmo assim',
        variant: 'danger',
      });
      if (!confirmed) return;
    }

    setSaving(true);
    const batchId = `mov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logs: { itemId: string; log: MovementLog }[] = [];
    const batch = writeBatch(db);
    for (const { item, delta } of withItems) {
      const qty = Math.abs(delta);
      const type: 'in' | 'out' = delta < 0 ? 'out' : 'in';
      const log: MovementLog = {
        type, quantity: qty,
        reason: type === 'out' ? 'Venda presencial (loja física)' : 'Reposição de estoque',
        date: new Date().toISOString(), saleId: batchId,
        by: staffActor(user),
      };
      logs.push({ itemId: item.id, log });
      batch.update(doc(db, 'inventory', item.id), {
        quantity: increment(delta),
        history: arrayUnion(log),
        updatedAt: serverTimestamp(),
      });
    }

    // Não espera o servidor confirmar pra liberar a tela: o Firestore já
    // aplica a mudança no cache local na hora (é o que o resto do painel
    // lê pra mostrar o número novo) e guarda o envio numa fila que sincroniza
    // sozinha quando a internet melhorar. Com wifi ruim de loja, esperar o
    // "ok" do servidor podia deixar o vendedor com a tela travada minutos -
    // aqui ele bate, sente a vibração, e já pode atender o próximo cliente.
    const commitPromise = batch.commit();
    vibrate([15, 40, 15]);

    const sales = withItems.filter(e => e.delta < 0).length;
    const restocks = withItems.filter(e => e.delta > 0).length;
    const parts = [];
    if (sales > 0) parts.push(`${sales} ${sales === 1 ? 'venda' : 'vendas'}`);
    if (restocks > 0) parts.push(`${restocks} ${restocks === 1 ? 'reposição' : 'reposições'}`);

    const offlineNote = typeof navigator !== 'undefined' && !navigator.onLine
      ? ' Sem internet agora, vai sincronizar sozinho assim que voltar.'
      : '';
    onDone(`Registrado: ${parts.join(' e ')} (${plural(pendingUnits, 'peça', 'peças')}).${offlineNote}`, async () => {
      try {
        const undoBatch = writeBatch(db);
        for (const { itemId, log } of logs) {
          undoBatch.update(doc(db, 'inventory', itemId), {
            quantity: increment(log.type === 'out' ? log.quantity : -log.quantity),
            history: arrayUnion({
              type: log.type === 'out' ? 'in' : 'out', quantity: log.quantity, reason: `Desfeito: ${log.reason}`,
              date: new Date().toISOString(), saleId: batchId, by: staffActor(user),
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
    setSaving(false);

    // A tela já seguiu em frente (o vendedor não espera isso). Só se der um
    // erro de verdade, não simplesmente "ainda sem sincronizar", que avisa,
    // porque isso não se resolve sozinho quando a internet voltar.
    commitPromise.catch(err => {
      console.error('[nova-venda] falha ao sincronizar', err);
      onDone('Atenção: uma venda não terminou de salvar (erro, não só rede fraca), confira o estoque desse produto.');
    });
  }

  return (
    <div
      ref={panelRef}
      tabIndex={embedded ? undefined : -1}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label={embedded ? undefined : 'Registrar movimentação'}
      className={embedded ? 'flex flex-col' : 'overlay-enter fixed inset-0 z-[60] h-[100dvh] bg-paper flex flex-col outline-none'}
      style={!embedded && viewportHeight ? { height: viewportHeight } : undefined}
    >
      {/* Cabeçalho */}
      <div className={`px-4 py-3 shrink-0 flex flex-col gap-3 ${embedded ? '' : 'border-b border-mist'}`}>
        {!embedded && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-bold text-ink">Registrar movimentação</p>
            <button type="button" onClick={onClose} className="text-faint hover:text-ink hover:bg-warm active:scale-90 rounded-lg p-1.5 transition-[color,background-color,transform] duration-150" aria-label="Fechar">
              <IconX size={20} />
            </button>
          </div>
        )}

        {/* Venda ou Reposição */}
        <div className="grid grid-cols-2 border border-mist p-1 bg-white dark:bg-warm rounded-xl">
          <button onClick={() => setMode('venda')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[15px] font-bold normal-case tracking-normal transition-colors rounded-lg ${mode === 'venda' ? 'bg-ink text-paper' : 'text-mid'}`}>
            <IconMinusCircle size={15} /> Vender
          </button>
          <button onClick={() => setMode('reposicao')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[13px] font-bold uppercase tracking-wide transition-colors rounded-lg ${mode === 'reposicao' ? 'bg-emerald-600 text-white' : 'text-mid'}`}>
            <IconPlusCircle size={15} /> <span className="sm:hidden">Chegou</span><span className="hidden sm:inline">Chegou mercadoria</span>
          </button>
        </div>

        {soldToday > 0 && (
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-500 -mb-1">
            <IconReceipt size={13} /> {soldToday} {soldToday === 1 ? 'peça vendida' : 'peças vendidas'} hoje
          </p>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            <input type="search" aria-label="Buscar produto" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-mist bg-white dark:bg-warm pl-8 pr-2 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-clay-l/20 rounded-xl" />
          </div>
          <div className="flex items-center shrink-0 border border-mist bg-white dark:bg-warm rounded-xl">
            <span className="flex items-center pl-2.5 pr-1 text-[11px] leading-tight text-faint">
              Fotos por linha
            </span>
            {(isMobile ? COL_OPTIONS_MOBILE : COL_OPTIONS_DESKTOP).map(n => (
              <button key={n} onClick={() => changeCols(n)} title={`${n} fotos por linha`}
                className={`w-10 h-10 text-[12.5px] font-bold rounded-lg transition-colors ${cols === n ? 'bg-ink text-paper' : 'text-mid hover:bg-warm'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[13px] text-faint -mt-1.5">
          Toque na foto = 1 peça. Errou? Toque em Limpar lá embaixo.
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
                  <p className="text-[12px] font-semibold text-ink truncate px-0.5">{item.productName}</p>
                  <button type="button" onClick={() => tap(item)}
                    className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-colors ${
                      delta < 0 ? 'border-red-500' : delta > 0 ? 'border-emerald-500' : 'border-mist'
                    }`}>
                    {image ? (
                      <img src={image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full bg-warm flex items-center justify-center">
                        <IconBox size={26} className="text-[#D8CDBE]" />
                      </span>
                    )}
                    {/* span e não div/p: dentro de <button> só cabe conteúdo de frase. */}
                    <span className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1.5 text-left">
                      <span className="block text-[11px] text-white/85 truncate leading-tight">{variantLabel(item)}</span>
                      <span className="block text-[13px] font-bold text-white leading-tight">
                        {/* Estoque baixo em destaque */}
                        <span className={avail <= item.lowStockThreshold ? 'inline-block bg-amber-700 text-white px-1.5 rounded' : undefined}>{avail} em estoque</span>
                      </span>
                    </span>
                    {delta !== 0 && (
                      <>
                        <span className={`absolute top-1 right-1 h-5 w-5 rounded-full flex items-center justify-center text-white text-[12px] font-bold leading-none ${delta < 0 ? 'bg-red-600' : 'bg-emerald-500'}`}>
                          {delta < 0 ? '×' : '✓'}
                        </span>
                        <span className={`absolute top-1 left-1 h-5 min-w-5 px-1 rounded-full flex items-center justify-center text-white text-[11px] font-bold leading-none ${delta < 0 ? 'bg-red-600' : 'bg-emerald-500'}`}>
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
      <div className={`px-4 py-3 flex items-center gap-2 bg-paper ${embedded
        // Só gruda com algo marcado: parada, a dica "Toque nos produtos"
        // cobria a última fileira de fotos à toa.
        ? `-mx-5 sm:mx-0 sm:rounded-2xl ${pendingCount > 0 || saving ? 'sticky above-panel-tabbar z-10 border-t border-mist sm:border shadow-[0_-4px_10px_rgba(0,0,0,0.06)]' : 'bg-transparent'}`
        : 'border-t border-mist shrink-0'}`}>
        {pendingCount > 0 && (
          <button onClick={clearAll} disabled={saving}
            className="shrink-0 border border-mist text-mid text-[12px] font-semibold px-3 py-3 hover:bg-warm disabled:opacity-50 rounded-xl">
            Limpar
          </button>
        )}
        {pendingCount === 0 && !saving ? (
          // Sem nada marcado: só a dica (antes era um botão apagado com ✓,
          // parecia quebrado).
          <p className="flex-1 h-12 flex items-center justify-center text-[13px] text-faint">Toque nos produtos acima</p>
        ) : (
          <button onClick={confirmAll} disabled={saving}
            className="flex-1 h-12 bg-ink text-paper text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-ink/80 transition-colors rounded-xl animate-fade-in">
            <IconCheck size={15} />
            {saving ? 'Salvando...' : `Confirmar (${pendingCount} ${pendingCount === 1 ? 'produto' : 'produtos'} · ${pendingUnits} ${pendingUnits === 1 ? 'peça' : 'peças'})`}
          </button>
        )}
      </div>
    </div>
  );
}
