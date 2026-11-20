import { adminDb } from '@/lib/firebase/admin';
import { validateCoupon } from '@/lib/orderPricing';
import { couponCustomerUsage } from '@/lib/orders/couponUsage';
import type { Coupon } from '@/types';

/**
 * Desconto do cupom salvo no carrinho, com a mesma regra do pagamento
 * (inclusive o limite por cliente e a primeira compra, quando vem o uid).
 * 0 quando não há cupom, ele não existe ou não vale para o pedido.
 */
export async function cartCouponDiscountCents(code: string | null | undefined, productsCents: number, uid?: string): Promise<number> {
  if (!code) return 0;
  try {
    const [snap, usage] = await Promise.all([
      adminDb.collection('coupons').doc(code).get(),
      uid ? couponCustomerUsage(code, uid) : Promise.resolve(undefined),
    ]);
    if (!snap.exists) return 0;
    const result = validateCoupon(snap.data()! as Coupon, productsCents, new Date(), usage);
    return result.valid ? result.discountCents : 0;
  } catch {
    return 0;
  }
}
