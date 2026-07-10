'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { StarRating } from './StarRating';
import { formatDate } from '@/lib/utils/format';
import type { Order, Review } from '@/types';

interface Props {
  productId: string;
  initialReviews: Review[];
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
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro ao enviar avaliação');
      const { id } = await res.json();
      setReviews(prev => [
        { id, productId, orderId: eligibleOrderId, userId: user!.uid, userName: user!.displayName ?? 'Você', rating: rating as Review['rating'], comment, createdAt: new Date().toISOString() },
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

  return (
    <section id="avaliacoes" className="border-t border-mist section-md">
      <div className="container-shop max-w-3xl">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <span className="eyebrow mb-3 block">Depoimentos</span>
            <h2 className="font-display font-normal text-ink text-3xl">Avaliações</h2>
          </div>
          {count > 0 && (
            <div className="flex items-center gap-3">
              <StarRating value={average} size={18} />
              <span className="text-sm text-mid">
                <strong className="text-ink font-semibold">{average.toFixed(1)}</strong> · {count} avaliaç{count === 1 ? 'ão' : 'ões'}
              </span>
            </div>
          )}
        </div>

        {/* CTA de avaliar (só aparece se o usuário comprou e recebeu, e ainda não avaliou) */}
        {eligibleOrderId && !formOpen && (
          <div className="border border-mist bg-warm/40 px-5 py-4 mb-8 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-[13px] text-mid">Você recebeu este produto. Conte pra outros clientes o que achou.</p>
            <button onClick={() => setFormOpen(true)} className="btn-clay text-xs px-5 py-2.5 font-semibold tracking-wide shrink-0">
              Avaliar produto
            </button>
          </div>
        )}

        {done && (
          <div className="border border-emerald-200 bg-emerald-50 text-emerald-700 text-[13px] px-5 py-4 mb-8">
            Obrigado! Sua avaliação foi publicada.
          </div>
        )}

        {formOpen && (
          <div className="border border-mist px-5 py-5 mb-8">
            <p className="text-[12px] font-semibold text-ink mb-3">Sua nota</p>
            <div className="flex items-center gap-1 mb-4" onMouseLeave={() => setHoverRating(0)}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                  className="p-0.5"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24"
                    fill={(hoverRating || rating) >= n ? '#b45744' : 'none'}
                    stroke={(hoverRating || rating) >= n ? '#b45744' : 'currentColor'}
                    strokeWidth="1.5" className="text-mist transition-colors">
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
              className="w-full border border-mist px-3 py-2.5 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-clay transition-colors resize-none"
            />
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            <div className="flex items-center gap-3 mt-4">
              <button onClick={handleSubmit} disabled={submitting} className="btn-clay text-xs px-5 py-2.5 font-semibold tracking-wide">
                {submitting ? <><span className="spinner w-3.5 h-3.5" /> Enviando…</> : 'Publicar avaliação'}
              </button>
              <button onClick={() => setFormOpen(false)} className="text-xs text-mid hover:text-ink transition-colors font-medium">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {count === 0 ? (
          <p className="text-[13px] text-faint">Ainda não há avaliações para este produto.</p>
        ) : (
          <div className="flex flex-col divide-y divide-mist">
            {reviews.map(r => (
              <div key={r.id} className="py-5">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <p className="text-[13px] font-semibold text-ink">{r.userName}</p>
                  <p className="text-[11px] text-faint shrink-0">{r.createdAt ? formatDate(r.createdAt) : ''}</p>
                </div>
                <StarRating value={r.rating} size={13} className="mb-2" />
                {r.comment && <p className="text-[13px] text-mid leading-relaxed">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
