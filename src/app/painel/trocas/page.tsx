'use client';
import { PainelSkeleton } from '@/components/painel/PainelSkeleton';
import { plural } from '@/lib/plural';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, doc, updateDoc, arrayUnion, increment, serverTimestamp, runTransaction, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { useAuth } from '@/lib/auth/AuthContext';
import { auth } from '@/lib/firebase/client';
import type { ReturnRequest, ReturnStatus } from '@/types';
import { expandStockLines } from '@/lib/orderStockLines';
import { formatDateTime } from '@/lib/utils/format';
import { IconExchange, IconCheck, IconX, IconBox } from '@/components/ui/Icon';
import { staffActor } from '@/lib/staffActor';
import { PanelErrorState } from '@/components/painel/PanelErrorState';
import { ReversaCard, type ReversaView } from '@/components/painel/ReversaCard';
import { ColetaUberCard, LojaCard, type ColetaUberView } from '@/components/painel/ColetaCards';
import { EstornoCard, pedirEstorno, type EstornoView } from '@/components/painel/EstornoCard';
import { ReturnPhotos } from '@/components/order/ReturnPhotos';

const STATUS_LABEL: Record<ReturnStatus, string> = {
  solicitada: 'Solicitada', aprovada: 'Aprovada', recusada: 'Recusada', concluida: 'Concluída',
};
const STATUS_BADGE: Record<ReturnStatus, string> = {
  solicitada: 'bg-amber-50 text-amber-700 border-amber-200',
  aprovada: 'bg-blue-50 text-blue-700 border-blue-200',
  recusada: 'bg-red-50 text-red-700 border-red-200',
  concluida: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
const FILTERS: { key: ReturnStatus | 'todas'; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'solicitada', label: 'Solicitadas' },
  { key: 'aprovada', label: 'Aprovadas' },
  { key: 'concluida', label: 'Concluídas' },
  { key: 'recusada', label: 'Recusadas' },
];

type Extras = { devolverPor?: 'correios' | 'uber' | 'loja'; reversa?: ReversaView; coletaUber?: ColetaUberView; recebidaEm?: string; estorno?: EstornoView };
const extras = (r: ReturnRequest) => r as ReturnRequest & Extras;
const DEVOLVE: Record<string, string> = { correios: 'volta pelos Correios', uber: 'Uber busca no cliente', loja: 'cliente entrega na loja' };

const PAGE = 30;
const OPEN_STATUSES: ReturnStatus[] = ['solicitada', 'aprovada'];

export default function TrocasPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReturnStatus | 'todas'>('todas');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [loadError, setLoadError] = useState(false);

  // Em aberto (solicitada/aprovada) vêm sempre todas; o histórico vem aos
  // poucos, do mais novo pro mais antigo. Antes lia a coleção inteira a cada
  // abertura da tela, e ela só cresce.
  const [open, setOpen] = useState<ReturnRequest[]>([]);
  const [history, setHistory] = useState<ReturnRequest[]>([]);
  const [pageSize, setPageSize] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'returns'), where('status', 'in', OPEN_STATUSES)),
      snap => { setOpen(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReturnRequest))); setLoadError(false); },
      () => { setLoading(false); setLoadError(true); }
    );
  }, []);
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'returns'), orderBy('createdAt', 'desc'), limit(pageSize)),
      snap => {
        setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReturnRequest)));
        setHasMore(snap.size >= pageSize);
        setLoading(false); setLoadingMore(false); setLoadError(false);
      },
      () => { setLoading(false); setLoadingMore(false); setLoadError(true); }
    );
  }, [pageSize]);
  const requests = useMemo(() => {
    const byId = new Map<string, ReturnRequest>();
    for (const r of [...history, ...open]) byId.set(r.id, r);
    return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [open, history]);

  const filtered = useMemo(
    () => (filter === 'todas' ? requests : requests.filter(r => r.status === filter)),
    [requests, filter]
  );
  // Com histórico ainda por carregar, só a contagem das em aberto é exata.
  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: requests.length };
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
    if (hasMore) for (const k of ['todas', 'concluida', 'recusada']) delete c[k];
    return c;
  }, [requests, hasMore]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(t => (t === msg ? '' : t)), 3000);
  }

  /** E-mail do novo status para o cliente (aprovada, recusada, concluída). */
  async function avisar(r: ReturnRequest) {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/painel/trocas/${r.id}/avisar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (data.result === 'sem-email') showToast('Atualizado. O cliente não tem e-mail cadastrado para receber o aviso.');
      else if (!res.ok) showToast('Atualizado, mas o e-mail para o cliente não saiu agora.');
    } catch { /* sem conexão: o status já mudou, o aviso fica para depois */ }
  }

  async function setStatus(r: ReturnRequest, status: ReturnStatus) {
    setBusyId(r.id);
    try {
      await updateDoc(doc(db, 'returns', r.id), { status, updatedAt: serverTimestamp() });
      showToast(status === 'aprovada' ? 'Aprovada. O cliente recebe um e-mail.' : status === 'recusada' ? 'Recusada. O cliente recebe um e-mail.' : 'Atualizado.');
      void avisar(r);
    } catch (err) {
      console.error('[trocas] falha ao atualizar status', err);
      showToast('Não deu pra atualizar agora.');
    } finally {
      setBusyId(null);
    }
  }

  async function receberNaLoja(r: ReturnRequest) {
    setBusyId(r.id);
    try {
      await updateDoc(doc(db, 'returns', r.id), { recebidaEm: new Date().toISOString(), updatedAt: serverTimestamp() });
      showToast('Recebida. O cliente recebe um e-mail.');
      void avisar(r);
    } catch (err) {
      console.error('[trocas] falha ao marcar recebida', err);
      showToast('Não deu pra atualizar agora.');
    } finally {
      setBusyId(null);
    }
  }

  /** Marca como concluída e, se pedido, devolve as peças pro estoque -
   *  procurando o item de inventário pelo SKU (mesmo padrão do resto do
   *  painel de estoque). expandStockLines inclui a fronha trocada (Jogo
   *  de Cama) na reposição também, senão o estoque dela nunca voltaria
   *  numa devolução (foi debitado junto na venda, ver src/lib/orderStockLines.ts).
   *  Item que não existir mais no catálogo é ignorado silenciosamente
   *  ali, mas avisa no final. */
  async function concludeAndRestock(r: ReturnRequest, restock: boolean) {
    setBusyId(r.id);
    try {
      // Tudo numa transação que relê a troca: antes a reposição e o
      // "concluída" eram duas escritas soltas, e dois toques (ou dois
      // celulares) devolviam o estoque em dobro.
      const missing = await runTransaction(db, async tx => {
        const returnRef = doc(db, 'returns', r.id);
        const current = await tx.get(returnRef);
        if (!current.exists() || current.data().status === 'concluida') throw new Error('ALREADY_DONE');
        let notFound = 0;
        const lines = restock ? expandStockLines(r.items) : [];
        const invRefs = lines.map(line => doc(db, 'inventory', line.sku));
        const invSnaps = await Promise.all(invRefs.map(ref => tx.get(ref)));
        lines.forEach((line, i) => {
          if (!invSnaps[i].exists()) { notFound++; return; }
          tx.update(invRefs[i], {
            quantity: increment(line.quantity),
            history: arrayUnion({
              type: 'in', quantity: line.quantity,
              reason: `Troca/devolução, pedido #${r.orderId.slice(-8).toUpperCase()}`,
              date: new Date().toISOString(),
              by: staffActor(user),
            }),
            updatedAt: serverTimestamp(),
          });
        });
        tx.update(returnRef, { status: 'concluida', restocked: restock, updatedAt: serverTimestamp() });
        return notFound;
      });
      void avisar(r);
      // Devolução conferida: o dinheiro volta pela AbacatePay na hora. Se não
      // der (parte do pedido, pago por fora), o cartão mostra o que fazer.
      if (r.type === 'devolucao') {
        const err = await pedirEstorno(r.id, 'abacatepay');
        if (!err) { showToast('Concluída. O dinheiro está voltando para o cliente.'); return; }
      }
      showToast(
        restock
          ? (missing > 0 ? `Concluído. ${plural(missing, 'item não achado', 'itens não achados')} no estoque pra repor.` : 'Concluído e devolvido ao estoque.')
          : 'Concluído (sem repor estoque).'
      );
    } catch (err) {
      if (err instanceof Error && err.message === 'ALREADY_DONE') {
        showToast('Essa troca já tinha sido concluída.');
      } else {
        console.error('[trocas] falha ao concluir', err);
        showToast('Não deu pra concluir agora.');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Trocas e devoluções</h1>
        <p className="text-[13px] text-faint mt-1">
          Pedidas pelo cliente no site ou registradas por aqui a partir de um pedido.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 min-h-9 text-[11px] font-semibold border transition-colors ${ filter === f.key ? 'bg-ink text-paper border-ink' : 'bg-paper text-mid border-mist hover:bg-warm' } rounded-xl`}
          >
            {f.label} {counts[f.key] ? <span className="opacity-60">({counts[f.key]})</span> : null}
          </button>
        ))}
      </div>

      {loadError ? (
        <PanelErrorState onRetry={() => window.location.reload()} />
      ) : loading ? (
        <PainelSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <div className="border border-mist bg-paper py-16 text-center rounded-xl">
          <IconExchange size={32} className="text-mist mx-auto mb-3" />
          <p className="text-sm text-ink font-medium">Nenhuma solicitação {filter !== 'todas' ? `no status "${STATUS_LABEL[filter as ReturnStatus]}"` : 'ainda'}.</p>
          {filter === 'todas' && (
            <>
              <p className="text-[13px] text-faint mt-1.5 max-w-[36ch] mx-auto leading-relaxed">
                Pra registrar uma troca ou devolução, abra um pedido entregue e toque em &quot;Registrar troca ou devolução&quot;.
              </p>
              <Link href="/painel/pedidos" className="inline-flex items-center gap-1.5 mt-4 min-h-10 px-4 rounded-xl border border-mist text-[12.5px] font-semibold text-ink hover:bg-warm transition-colors">
                Ver pedidos
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(r => (
            <div key={r.id} className="border border-mist bg-paper p-4 rounded-xl">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 border rounded-full ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className="text-[11px] font-semibold text-mid uppercase">{r.type === 'troca' ? 'Troca' : 'Devolução'}</span>
                    {r.createdBy === 'cliente' && <span className="text-[11px] text-faint">pedida pelo site</span>}
                    {extras(r).devolverPor && <span className="text-[11px] text-faint">· {DEVOLVE[extras(r).devolverPor!]}</span>}
                    {r.restocked && (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-700">
                        <IconBox size={11} /> repôs estoque
                      </span>
                    )}
                  </div>
                  <Link href={`/painel/pedidos/${r.orderId}`} className="text-[13px] font-semibold text-clay hover:text-clay-d mt-1 inline-block">
                    Pedido #{r.orderId.slice(-8).toUpperCase()}
                  </Link>
                  {r.customerName && <span className="text-[13px] text-mid">, {r.customerName}</span>}
                </div>
                <span className="text-[11px] text-faint shrink-0">{formatDateTime(r.createdAt)}</span>
              </div>

              <p className="text-[13px] text-ink mb-2">{r.reason}</p>
              {(r as { fotos?: string[] }).fotos?.length ? (
                <div className="mb-3"><ReturnPhotos paths={(r as { fotos?: string[] }).fotos} size={72} /></div>
              ) : null}

              <ul className="text-[12px] text-mid mb-3">
                {r.items.map((it, i) => (
                  <li key={i}>
                    {it.quantity}× {it.productName}, {it.variant.size} · {it.variant.fabric}
                    {it.variant.colorName ? ` · ${it.variant.colorName}` : ''}
                  </li>
                ))}
              </ul>

              {r.status === 'solicitada' && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setStatus(r, 'aprovada')} disabled={busyId === r.id}
                    className="flex items-center gap-1.5 border border-ink text-ink text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50 rounded-full">
                    <IconCheck size={12} /> Aprovar
                  </button>
                  <button onClick={() => setStatus(r, 'recusada')} disabled={busyId === r.id}
                    className="flex items-center gap-1.5 border border-mist text-mid text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-warm transition-colors disabled:opacity-50 rounded-xl">
                    <IconX size={12} /> Recusar
                  </button>
                </div>
              )}

              {(r.status === 'aprovada' || extras(r).reversa || extras(r).coletaUber) && (
                <div className="mb-3 -mt-1">
                  {extras(r).devolverPor === 'uber'
                    ? <ColetaUberCard returnId={r.id} coleta={extras(r).coletaUber} saving={busyId === r.id} />
                    : extras(r).devolverPor === 'loja'
                      ? (r.status === 'aprovada' || extras(r).recebidaEm) && <LojaCard recebidaEm={extras(r).recebidaEm} onReceber={() => receberNaLoja(r)} busy={busyId === r.id} />
                      : <ReversaCard returnId={r.id} reversa={extras(r).reversa} saving={busyId === r.id} />}
                </div>
              )}

              {r.type === 'devolucao' && r.status === 'concluida' && (
                <EstornoCard returnId={r.id} orderId={r.orderId} items={r.items} estorno={extras(r).estorno} />
              )}

              {r.status === 'aprovada' && r.type === 'devolucao' && (
                <p className="text-[11.5px] text-faint mb-2">Só conclua depois de conferir as peças: ao concluir, o dinheiro volta para o cliente.</p>
              )}
              {r.status === 'aprovada' && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => concludeAndRestock(r, true)} disabled={busyId === r.id}
                    className="flex items-center gap-1.5 bg-ink text-paper text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-ink/80 transition-colors disabled:opacity-50 rounded-full">
                    <IconBox size={12} /> {busyId === r.id ? 'Concluindo...' : 'Concluir e repor estoque'}
                  </button>
                  <button onClick={() => concludeAndRestock(r, false)} disabled={busyId === r.id}
                    className="border border-mist text-mid text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-warm transition-colors disabled:opacity-50 rounded-xl">
                    Concluir sem repor (item com defeito)
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {hasMore && !loading && !loadError && (
        <button
          type="button"
          onClick={() => { setLoadingMore(true); setPageSize(n => n + PAGE); }}
          disabled={loadingMore}
          className="mt-4 w-full min-h-11 border border-mist bg-paper text-[12px] font-semibold text-mid hover:bg-warm hover:text-ink active:scale-[0.99] transition-[background-color,color,transform] duration-150 disabled:opacity-60 rounded-xl inline-flex items-center justify-center gap-2"
        >
          {loadingMore ? <><span className="spinner-dark" />Carregando…</> : 'Carregar trocas mais antigas'}
        </button>
      )}

      {toast && (
        <div className="fixed above-panel-tabbar-toast left-4 right-4 sm:left-auto sm:right-6 sm:w-auto bg-ink text-paper text-[13px] font-semibold px-5 py-3 shadow-lg z-50 rounded-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
