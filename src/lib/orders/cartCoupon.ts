import { adminDb } from '@/lib/firebase/admin';
import { validateCoupon } from '@/lib/orderPricing';
import type { Coupon } from '@/types';

/**
 * Desconto do cupom salvo no carrinho, com a mesma regra do pagamento.
 * 0 quando não há cupom, ele não existe ou não vale para o pedido.
 */
export async function cartCouponDiscountCents(code: string | null | undefined, productsCents: number): Promise<number> {
  if (!code) return 0;
  try {
    const snap = await adminDb.collection('coupons').doc(code).get();
    if (!snap.exists) return 0;
    const result = validateCoupon(snap.data()! as Coupon, productsCents);
    return result.valid ? result.discountCents : 0;
  } catch {
    return 0;
  }
}
