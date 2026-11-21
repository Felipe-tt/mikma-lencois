import { createHash } from 'node:crypto';
import type { Review } from '@/types';

/**
 * Id que sai na página: o do documento é `${pedido}_${produto}`, e o id do
 * pedido de quem avaliou não é público. Mesmo id do documento, mesmo
 * resultado (serve de chave na lista).
 */
export function publicReviewId(docId: string): string {
  return createHash('sha256').update(`avaliacao:${docId}`).digest('base64url').slice(0, 16);
}

/** "Maria Silva Souza" -> "Maria S." (sobrenome só a inicial). */
export function shortReviewerName(name: string | undefined | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Cliente';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export type PublicReview = Pick<Review, 'id' | 'productId' | 'userName' | 'rating' | 'comment' | 'createdAt'>;

/**
 * O que pode sair na página do produto e na API pública. Antes ia o
 * documento inteiro: nome completo, ID do comprador e ID do pedido de
 * quem avaliou ficavam visíveis pra qualquer visitante.
 */
export function toPublicReview(r: Review): PublicReview {
  return {
    id: publicReviewId(r.id),
    productId: r.productId,
    userName: shortReviewerName(r.userName),
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
  };
}
