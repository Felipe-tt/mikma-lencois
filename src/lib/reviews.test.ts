import { describe, expect, it } from 'vitest';
import type { Review } from '@/types';
import { publicReviewId, shortReviewerName, toPublicReview } from './reviews';

const review = {
  id: 'ord_0123456789abcdef_p1', productId: 'p1', orderId: 'ord_0123456789abcdef', userId: 'uid-da-maria',
  userName: 'Maria Silva Souza', rating: 5, comment: 'Macio.', createdAt: '2026-11-01T10:00:00.000Z',
} as unknown as Review;

describe('avaliação pública', () => {
  it('não leva o id do pedido, o uid nem o nome completo', () => {
    const pub = toPublicReview(review);
    expect(JSON.stringify(pub)).not.toMatch(/ord_0123456789abcdef|uid-da-maria|Silva|Souza/);
    expect(pub).toMatchObject({ productId: 'p1', userName: 'Maria S.', rating: 5, comment: 'Macio.' });
  });

  it('o id público é estável e diferente para cada avaliação', () => {
    expect(publicReviewId(review.id)).toBe(toPublicReview(review).id);
    expect(publicReviewId(review.id)).not.toBe(publicReviewId('ord_0123456789abcdef_p2'));
    expect(publicReviewId(review.id)).toMatch(/^[\w-]{16}$/);
  });

  it('nome curto', () => {
    expect(shortReviewerName('  ana  ')).toBe('ana');
    expect(shortReviewerName('')).toBe('Cliente');
  });
});
