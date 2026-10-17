import Link from 'next/link';

export interface HomeReview { id: string; userName: string; rating: number; comment: string; productName?: string; productId: string }

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span role="img" aria-label={`${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} de 5 estrelas`} className="inline-flex gap-0.5 text-clay">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={i <= Math.round(value) ? 'fill-current' : 'fill-mist'}>
          <path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6L2.5 9.5l6.6-.8z" />
        </svg>
      ))}
    </span>
  );
}

// Avaliações reais, de quem comprou e recebeu (a API só aceita avaliação de
// pedido entregue). Sem avaliação suficiente, a seção não aparece.
export function HomeReviews({ reviews, average, total }: { reviews: HomeReview[]; average: number; total: number }) {
  if (reviews.length < 2) return null;
  return (
    <section aria-labelledby="avaliacoes-titulo" className="bg-paper">
      <div className="container-shop pb-20 sm:pb-28">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8 sm:mb-10">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-clay mb-4">Quem dorme, conta</p>
            <h2 id="avaliacoes-titulo" className="font-display font-normal text-ink leading-[1.05] tracking-[-0.02em] text-[clamp(2rem,4vw,3.2rem)]">
              Noites bem dormidas
            </h2>
          </div>
          {total > 0 && (
            <div className="flex items-center gap-3">
              <span className="font-display text-[2.6rem] leading-none text-ink tabular-nums">
                {average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <span>
                <Stars value={average} />
                <span className="block text-[12px] text-faint mt-1">{total} {total === 1 ? 'avaliação' : 'avaliações'} de clientes</span>
              </span>
            </div>
          )}
        </div>

        <ul className={`grid grid-cols-1 gap-3 sm:gap-4 ${reviews.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {reviews.slice(0, 3).map(r => (
            <li key={r.id} className="flex flex-col rounded-2xl border border-mist bg-paper p-6 sm:p-7">
              <Stars value={r.rating} />
              <blockquote className="mt-4 text-[15px] text-ink leading-relaxed line-clamp-6">
                “{r.comment.trim()}”
              </blockquote>
              <div className="mt-auto pt-6 flex items-center gap-3">
                <span aria-hidden="true" className="w-9 h-9 rounded-full bg-clay/10 text-clay text-[13px] font-semibold flex items-center justify-center">
                  {r.userName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink">{r.userName}</span>
                  {r.productName && (
                    <Link href={`/produtos/${r.productId}`} className="block text-[12px] text-faint hover:text-clay transition-colors truncate">
                      {r.productName}
                    </Link>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
