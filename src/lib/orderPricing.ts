/**
 * Cálculo de preço do pedido, PIX, cartão e cupons.
 *
 * Extraído das rotas /api/payment/create-pix, /api/payment/create-checkout e
 * /api/checkout/validate-coupon, que antes reimplementavam essa mesma conta
 * cada uma do seu jeito (risco real: as três podiam divergir sutilmente e
 * cobrar valores diferentes pro mesmo pedido). Agora é uma fonte só, testada.
 *
 * Tudo aqui é puro, sem Firestore, sem fetch, sem side-effect. Os valores já
 * chegam prontos (é a rota que busca no Firestore e chama essas funções).
 */

export interface CouponLike {
  active: boolean
  type: 'percent' | 'fixed'
  value: number // percent: 0-100 · fixed: centavos
  expiresAt?: string | null
  maxUses?: number | null
  usedCount?: number
  minOrderCents?: number | null
}

export interface CouponResult {
  valid: boolean
  /** Motivo em português, pronto pra mostrar ao cliente, quando valid=false */
  reason?: string
  discountCents: number
}

/** Soma preço unitário × quantidade de cada item, o "subtotal" antes de qualquer desconto/frete. */
export function computeProductsCents(items: { unitPrice: number; quantity: number }[]): number {
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}

/**
 * Valida um cupom e calcula o desconto em centavos, se válido.
 * Mesma regra nas três rotas que usam cupom: ativo, não expirado, dentro do
 * limite de usos, e o pedido bate o mínimo exigido (quando houver).
 */
export function validateCoupon(coupon: CouponLike, productsCents: number, now: Date = new Date()): CouponResult {
  if (!coupon.active) return { valid: false, reason: 'Cupom inativo', discountCents: 0 };
  if (coupon.expiresAt && new Date(coupon.expiresAt) <= now) {
    return { valid: false, reason: 'Cupom expirado', discountCents: 0 };
  }
  if (coupon.maxUses != null && (coupon.usedCount ?? 0) >= coupon.maxUses) {
    return { valid: false, reason: 'Cupom esgotado', discountCents: 0 };
  }
  if (coupon.minOrderCents != null && productsCents < coupon.minOrderCents) {
    return { valid: false, reason: `Pedido mínimo de R$ ${(coupon.minOrderCents / 100).toFixed(2)}`, discountCents: 0 };
  }
  const raw = coupon.type === 'percent'
    ? Math.round((productsCents * coupon.value) / 100)
    : coupon.value;
  // Desconto nunca passa do valor dos produtos: cupom de valor fixo maior
  // que o carrinho abatia também o frete (que a loja paga de verdade).
  const discountCents = Math.max(0, Math.min(raw, productsCents));
  return { valid: true, discountCents };
}

/** Desconto automático por pagar em PIX, só se o subtotal bater o piso configurado. */
export function computePixDiscountCents(
  productsCents: number,
  settings: { pixDiscountThresholdCents: number; pixDiscountPct: number }
): number {
  if (settings.pixDiscountThresholdCents <= 0) return 0;
  if (productsCents < settings.pixDiscountThresholdCents) return 0;
  return Math.round(productsCents * (settings.pixDiscountPct / 100));
}

/** Total final de um pedido pago via PIX. Nunca fica negativo. */
export function computePixTotalCents(args: {
  productsCents: number
  pixDiscountCents: number
  couponDiscountCents: number
  shippingCents: number
}): number {
  const { productsCents, pixDiscountCents, couponDiscountCents, shippingCents } = args;
  return Math.max(0, productsCents - pixDiscountCents - couponDiscountCents + shippingCents);
}

/** Total final de um pedido pago via cartão, sem desconto PIX, com taxa da adquirente embutida. */
export function computeCardTotalCents(args: {
  productsCents: number
  couponDiscountCents: number
  shippingCents: number
  feeRate: number // ex: 0.0399 para 3,99%
}): number {
  const { productsCents, couponDiscountCents, shippingCents, feeRate } = args;
  return Math.max(0, Math.round((productsCents - couponDiscountCents + shippingCents) * (1 + feeRate)));
}

/**
 * Juros do parcelamento no cartão, por número de parcelas. Usado no servidor
 * (valor cobrado) e no checkout (valor mostrado): antes a tabela vivia só na
 * rota de pagamento e o checkout mostrava "6x de R$ X" sem os juros.
 */
export const INSTALLMENT_FEES: Readonly<Record<number, number>> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0.0199,
  5: 0.0249,
  6: 0.0299,
  7: 0.0349,
  8: 0.0399,
  9: 0.0449,
  10: 0.0499,
  11: 0.0549,
  12: 0.0599,
};

export function installmentFeeRate(installments: number): number {
  return INSTALLMENT_FEES[installments] ?? 0;
}
