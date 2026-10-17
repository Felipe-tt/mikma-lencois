'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import type { Review } from '@/types';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { PanelErrorState } from '@/components/painel/PanelErrorState';
import { PainelSkeleton } from '@/components/painel/PainelSkeleton';
import { IconStar } from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/utils/format';

const PAGE = 50;

export default function AvaliacoesPage() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(pageSize)),
      snap => { setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as Review))); setLoadError(false); },
      err => { console.error('[avaliacoes] onSnapshot:', err); setLoadError(true); },
    );
  }, [pageSize]);

  async function remove(r: Review) {
    const { confirmed } = await confirmDialog({
      message: 'Apagar esta avaliação?',
      detail: 'Ela some da página do produto na hora. Não tem como desfazer.',
      confirmLabel: 'Apagar avaliação',
      variant: 'danger',
    });
    if (!confirmed) return;
    setBusyId(r.id); setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(r.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error);
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível apagar. Tente de novo.');
    } finally {
      setBusyId(null);
    }
  }

  if (loadError) return <PanelErrorState message="Não foi possível carregar as avaliações." onRetry={() => window.location.reload()} />;
  if (reviews === null) return <PainelSkeleton rows={4} />;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Avaliações</h1>
        <p className="text-[13px] text-faint mt-1">O que os clientes escreveram nos produtos. Apague só o que for ofensivo ou spam.</p>
      </div>

      {error && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 text-[12px] px-4 py-3 font-semibold rounded-lg">{error}</div>
      )}

      {reviews.length === 0 ? (
        <div className="panel-card panel-empty">
          <span className="panel-empty-icon"><IconStar size={20} /></span>
          <p className="text-[13px] text-mid">Nenhuma avaliação ainda.</p>
        </div>
      ) : (
        <ul className="panel-card divide-y divide-mist/70 overflow-hidden">
          {reviews.map(r => (
            <li key={r.id} className="px-5 py-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-amber-500 text-[13px] tracking-[0.1em]" aria-label={`${r.rating} de 5 estrelas`}>
                    {'★'.repeat(r.rating)}<span className="text-mist">{'★'.repeat(5 - r.rating)}</span>
                  </span>
                  <span className="text-[12px] font-semibold text-ink">{r.userName}</span>
                  <span className="text-[11px] text-faint">{formatDateTime(r.createdAt)}</span>
                </div>
                {r.comment
                  ? <p className="text-[13px] text-mid leading-relaxed break-words">{r.comment}</p>
                  : <p className="text-[12px] text-faint italic">Sem comentário</p>}
                <Link href={`/produtos/${r.productId}`} target="_blank" className="inline-flex items-center min-h-10 -my-1.5 text-[11px] font-semibold text-clay hover:text-clay-d">
                  Ver produto
                </Link>
              </div>
              <button
                type="button"
                onClick={() => remove(r)}
                disabled={busyId === r.id}
                className="shrink-0 min-h-9 px-3 text-[12px] font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 active:scale-[0.97] transition-[background-color,color,transform] duration-150 disabled:opacity-50 rounded-lg"
              >
                {busyId === r.id ? 'Apagando…' : 'Apagar'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {reviews.length >= pageSize && (
        <button
          type="button"
          onClick={() => setPageSize(n => n + PAGE)}
          className="mt-4 w-full min-h-11 border border-mist bg-paper text-[12px] font-semibold text-mid hover:bg-warm hover:text-ink transition-colors rounded-xl"
        >
          Carregar mais avaliações
        </button>
      )}
    </div>
  );
}
