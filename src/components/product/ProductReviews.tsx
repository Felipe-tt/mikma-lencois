'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { StarRating } from './StarRating';
import { formatDate } from '@/lib/utils/format';
import type { Order } from '@/types';
import type { PublicReview } from '@/lib/reviews';

interface Props {
  productId: string;
  initialReviews: PublicReview[];
}

export function ProductReviews({ productId, initialReviews }: Props) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState(initialReviews);
  const [eligibleOrderId, setEligibleOrderId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const count = reviews.length;
  const average = count > 0 ? reviews.reduce((acc, r) => acc + r.rating, 0) / count : 0;

  // Verifica se o usuário tem um pedido entregue com este produto que ainda não avaliou.
  useEffect(() => {
    if (!user) { setEligibleOrderId(null); return; }
    let cancelled = false;
    (async () => {
      const [ordersSnap, myReviewsSnap] = await Promise.all([
        getDocs(query(collection(db, 'orders'), where('userId', '==', user.uid), where('status', '==', 'delivered'))),
        getDocs(query(collection(db, 'reviews'), where('userId', '==', user.uid), where('productId', '==', productId))),
      ]);
      if (cancelled) return;
      const alreadyReviewedOrderIds = new Set(myReviewsSnap.docs.map(d => d.data().orderId as string));
      const candidate = ordersSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Order))
        .find(o => o.items.some(it => it.productId === productId) && !alreadyReviewedOrderIds.has(o.id));
      setEligibleOrderId(candidate?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [user, productId]);

  async function handleSubmit() {
    if (!eligibleOrderId) return;
    setSubmitting(true);
    setError('');
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: eligibleOrderId, productId, rating, comment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar avaliação');
      setReviews(prev => [
        { id: data.id, productId, userName: data.userName ?? 'Você', rating: rating as PublicReview['rating'], comment, createdAt: new Date().toISOString() },
        ...prev,
      ]);
      setEligibleOrderId(null);
      setFormOpen(false);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar avaliação');
    } finally {
      setSubmitting(false);
    }
  }

  // Distribuição por nota (5 → 1), pra barra de resumo.
  const distribution = [5, 4, 3, 2, 1].map(n => ({
    n,
    total: reviews.filter(r => Math.round(r.rating) === n).length,
  }));

  return (
    <section id="avaliacoes" className="border-t border-mist py-16 sm:py-20">
      <div className="container-shop">
        <div className="mb-10">
          <span className="eyebrow mb-3 block">Depoimentos</span>
          <h2 className="font-display font-normal text-ink text-[2rem] sm:text-[2.4rem] leading-none tracking-[-0.015em]">Avaliações</h2>
        </div>

        <div className="grid lg:grid-cols-[300px_1fr] gap-10 lg:gap-16 items-start">
          {/* Resumo: média grande, estrelas e distribuição. Antes era uma
              linha solta no canto e a lista ocupava a largura toda. */}
          <aside className="bg-warm/50 border border-mist p-6">
            {count > 0 ? (
              <>
                <div className="flex items-end gap-3">
                  <p className="font-display text-[3.4rem] leading-[0.85] text-ink tabular-nums">{average.toFixed(1)}</p>
                  <div className="pb-1">
                    <StarRating value={average} size={15} />
                    <p className="text-[12px] text-faint mt-1">{count} avaliaç{count === 1 ? 'ão' : 'ões'}</p>
                  </div>
                </div>
                <ul className="mt-6 flex flex-col gap-2" aria-label="Distribuição das notas">
                  {distribution.map(({ n, total }) => (
                    <li key={n} className="flex items-center gap-3 text-[12px] text-mid">
                      <span className="w-3 tabular-nums text-right">{n}</span>
                      <span className="flex-1 h-1.5 bg-mist rounded-full overflow-hidden">
                        <span className="block h-full bg-clay rounded-full" style={{ width: `${count ? (total / count) * 100 : 0}%` }} />
                      </span>
                      <span className="w-5 tabular-nums text-faint">{total}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="font-display text-[1.4rem] text-ink leading-tight">Ainda sem avaliações</p>
                <p className="text-[13px] text-mid mt-2 leading-relaxed">Quem compra e recebe o produto pode contar o que achou aqui.</p>
              </>
            )}

            {/* CTA de avaliar (só se comprou, recebeu e ainda não avaliou) */}
            {eligibleOrderId && !formOpen && (
              <div className="mt-6 pt-6 border-t border-mist">
                <p className="text-[13px] text-mid leading-relaxed mb-3">Você recebeu este produto. Conte pra outros clientes o que achou.</p>
                <button onClick={() => setFormOpen(true)} className="btn-clay w-full justify-center text-xs py-3 font-semibold tracking-wide">
                  Avaliar produto
                </button>
              </div>
            )}
          </aside>

          <div className="min-w-0">
            {done && (
              <div role="status" className="border border-emerald-200 bg-emerald-50 text-emerald-700 text-[13px] px-5 py-4 mb-8 animate-fade-in">
                Obrigado! Sua avaliação foi publicada.
              </div>
            )}

            {formOpen && (
              <div className="border border-mist px-5 py-5 mb-8 animate-fade-in">
                <p className="text-[12px] font-semibold text-ink mb-3">Sua nota</p>
                <div className="flex items-center gap-1 mb-4" onMouseLeave={() => setHoverRating(0)}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                      aria-pressed={rating === n}
                      className="p-0.5 active:scale-90 transition-transform duration-150"
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24"
                        fill={(hoverRating || rating) >= n ? '#b45744' : 'none'}
                        stroke={(hoverRating || rating) >= n ? '#b45744' : 'currentColor'}
                        strokeWidth="1.5" className="text-mist-d transition-colors duration-150">
                        <path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7-5.4-4.8 7.1-.7z" />
                      </svg>
                    </button>
                  ))}
                </div>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Conte como foi sua experiência com o produto (opcional)"
                  className="w-full border border-mist-d bg-paper px-3 py-2.5 text-[14px] text-ink placeholder:text-faint focus:outline-none focus:border-ink transition-colors resize-none"
                />
                {error && <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>}
                <div className="flex items-center gap-4 mt-4">
                  <button onClick={handleSubmit} disabled={submitting} className="btn-clay text-xs px-5 py-2.5 font-semibold tracking-wide">
                    {submitting ? <><span className="spinner w-3.5 h-3.5" /> Enviando…</> : 'Publicar avaliação'}
                  </button>
                  <button onClick={() => setFormOpen(false)} className="text-xs text-mid hover:text-ink transition-colors font-medium">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {count > 0 && (
              <ul className="flex flex-col divide-y divide-mist border-t border-mist">
                {reviews.map(r => (
                  <li key={r.id} className="py-6 flex gap-4">
                    <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full bg-clay/10 text-clay font-display text-[1.05rem] flex items-center justify-center">
                      {(r.userName || '?').trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="text-[14px] font-semibold text-ink">{r.userName}</p>
                        <p className="text-[11px] text-faint shrink-0 tabular-nums">{r.createdAt ? formatDate(r.createdAt) : ''}</p>
                      </div>
                      <StarRating value={r.rating} size={13} className="mt-1" />
                      {r.comment && <p className="text-[14px] text-ink/80 leading-relaxed mt-2.5 max-w-[65ch]">{r.comment}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
