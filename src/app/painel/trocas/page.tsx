'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, doc, updateDoc, query as fsQuery, where, limit, getDocs, arrayUnion, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { ReturnRequest, ReturnStatus } from '@/types';
import { formatDateTime } from '@/lib/utils/format';
import { IconExchange, IconCheck, IconX, IconBox } from '@/components/ui/Icon';

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

export default function TrocasPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReturnStatus | 'todas'>('todas');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'returns'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ReturnRequest));
      data.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setRequests(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = useMemo(
    () => (filter === 'todas' ? requests : requests.filter(r => r.status === filter)),
    [requests, filter]
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: requests.length };
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(t => (t === msg ? '' : t)), 3000);
  }

  async function setStatus(r: ReturnRequest, status: ReturnStatus) {
    setBusyId(r.id);
    try {
      await updateDoc(doc(db, 'returns', r.id), { status, updatedAt: serverTimestamp() });
      showToast(status === 'aprovada' ? 'Aprovada.' : status === 'recusada' ? 'Recusada.' : 'Atualizado.');
    } catch (err) {
      console.error('[trocas] falha ao atualizar status', err);
      showToast('Não deu pra atualizar agora.');
    } finally {
      setBusyId(null);
    }
  }

  /** Marca como concluída e, se pedido, devolve as peças pro estoque —
   *  procurando o item de inventário pelo SKU (mesmo padrão do resto do
   *  painel de estoque). Item que não existir mais no catálogo é ignorado
   *  silenciosamente ali, mas avisa no final. */
  async function concludeAndRestock(r: ReturnRequest, restock: boolean) {
    setBusyId(r.id);
    try {
      let missing = 0;
      if (restock) {
        const batch = writeBatch(db);
        for (const item of r.items) {
          const q = fsQuery(collection(db, 'inventory'), where('sku', '==', item.sku), limit(1));
          const snap = await getDocs(q);
          if (snap.empty) { missing++; continue; }
          const invDoc = snap.docs[0];
          batch.update(invDoc.ref, {
            quantity: increment(item.quantity),
            history: arrayUnion({
              type: 'in', quantity: item.quantity,
              reason: `Troca/devolução — pedido #${r.orderId.slice(-8).toUpperCase()}`,
              date: new Date().toISOString(),
              ...(user?.email ? { by: user.email } : {}),
            }),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
      await updateDoc(doc(db, 'returns', r.id), {
        status: 'concluida', restocked: restock, updatedAt: serverTimestamp(),
      });
      showToast(
        restock
          ? (missing > 0 ? `Concluído. ${missing} item(ns) não achado(s) no estoque pra repor.` : 'Concluído e devolvido ao estoque.')
          : 'Concluído (sem repor estoque).'
      );
    } catch (err) {
      console.error('[trocas] falha ao concluir', err);
      showToast('Não deu pra concluir agora.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Trocas e devoluções</h1>
        <p className="text-[13px] text-faint mt-1">
          Registradas a partir de um pedido — acompanhe e conclua por aqui.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[11px] font-bold uppercase tracking-[0.06em] px-3.5 py-2 border transition-colors ${
              filter === f.key ? 'bg-ink text-paper border-ink' : 'border-mist text-mid hover:bg-warm'
            }`}
          >
            {f.label} {counts[f.key] ? <span className="opacity-60">({counts[f.key]})</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[13px] text-faint">Carregando…</p>
      ) : filtered.length === 0 ? (
        <div className="border border-mist bg-paper py-16 text-center">
          <IconExchange size={32} className="text-mist mx-auto mb-3" />
          <p className="text-sm text-faint">Nenhuma solicitação {filter !== 'todas' ? `no status "${STATUS_LABEL[filter as ReturnStatus]}"` : 'ainda'}.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(r => (
            <div key={r.id} className="border border-mist bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 border rounded-full ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className="text-[11px] font-semibold text-mid uppercase">{r.type === 'troca' ? 'Troca' : 'Devolução'}</span>
                    {r.restocked && (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-700">
                        <IconBox size={11} /> repôs estoque
                      </span>
                    )}
                  </div>
                  <Link href={`/painel/pedidos/${r.orderId}`} className="text-[13px] font-semibold text-clay-l hover:text-clay-d mt-1 inline-block">
                    Pedido #{r.orderId.slice(-8).toUpperCase()}
                  </Link>
                  {r.customerName && <span className="text-[13px] text-mid"> — {r.customerName}</span>}
                </div>
                <span className="text-[11px] text-faint shrink-0">{formatDateTime(r.createdAt)}</span>
              </div>

              <p className="text-[13px] text-ink mb-2">{r.reason}</p>

              <ul className="text-[12px] text-mid mb-3">
                {r.items.map((it, i) => (
                  <li key={i}>
                    {it.quantity}× {it.productName} — {it.variant.size} · {it.variant.fabric}
                    {it.variant.colorName ? ` · ${it.variant.colorName}` : ''}
                  </li>
                ))}
              </ul>

              {r.status === 'solicitada' && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setStatus(r, 'aprovada')} disabled={busyId === r.id}
                    className="flex items-center gap-1.5 border border-ink text-ink text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50">
                    <IconCheck size={12} /> Aprovar
                  </button>
                  <button onClick={() => setStatus(r, 'recusada')} disabled={busyId === r.id}
                    className="flex items-center gap-1.5 border border-mist text-mid text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-warm transition-colors disabled:opacity-50">
                    <IconX size={12} /> Recusar
                  </button>
                </div>
              )}

              {r.status === 'aprovada' && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => concludeAndRestock(r, true)} disabled={busyId === r.id}
                    className="flex items-center gap-1.5 bg-ink text-paper text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-ink/80 transition-colors disabled:opacity-50">
                    <IconBox size={12} /> {busyId === r.id ? 'Concluindo...' : 'Concluir e repor estoque'}
                  </button>
                  <button onClick={() => concludeAndRestock(r, false)} disabled={busyId === r.id}
                    className="border border-mist text-mid text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-warm transition-colors disabled:opacity-50">
                    Concluir sem repor (item com defeito)
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto bg-ink text-paper text-[13px] font-semibold px-5 py-3 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
