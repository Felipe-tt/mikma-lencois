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
import { cardFeeFor, type PublicCardFees } from '@/lib/gatewayFees';

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

/**
 * Desconto automático por pagar em PIX, só se o subtotal bater o piso
 * configurado. Somado ao cupom, nunca passa do valor dos produtos (senão
 * abatia o frete, que a loja paga de verdade).
 */
export function computePixDiscountCents(
  productsCents: number,
  settings: { pixDiscountThresholdCents: number; pixDiscountPct: number },
  couponDiscountCents = 0,
): number {
  if (settings.pixDiscountThresholdCents <= 0) return 0;
  if (productsCents < settings.pixDiscountThresholdCents) return 0;
  const raw = Math.round(productsCents * (settings.pixDiscountPct / 100));
  return Math.max(0, Math.min(raw, productsCents - couponDiscountCents));
}

/** Total final de um pedido pago via PIX. Descontos nunca abatem o frete. */
export function computePixTotalCents(args: {
  productsCents: number
  pixDiscountCents: number
  couponDiscountCents: number
  shippingCents: number
}): number {
  const { productsCents, pixDiscountCents, couponDiscountCents, shippingCents } = args;
  const discount = Math.min(productsCents, pixDiscountCents + couponDiscountCents);
  return Math.max(0, productsCents - discount + shippingCents);
}

/**
 * Total final de um pedido pago via cartão, sem desconto PIX, com os juros do
 * parcelamento e, se a loja repassa, a taxa da AbacatePay por cima: o total
 * é tal que, tirando a taxa (percentual sobre o total + fixo), sobra o valor
 * com juros. Assim a loja recebe o mesmo que receberia sem a taxa.
 */
export function computeCardTotalCents(args: {
  productsCents: number
  couponDiscountCents: number
  shippingCents: number
  feeRate: number // juros, ex: 0.0399 para 3,99%
  cardFee?: { fixedCents: number; rate: number }
}): number {
  const { productsCents, couponDiscountCents, shippingCents, feeRate, cardFee } = args;
  const withInterest = Math.max(0, (productsCents - couponDiscountCents + shippingCents) * (1 + feeRate));
  if (!cardFee || (cardFee.fixedCents <= 0 && cardFee.rate <= 0) || withInterest === 0) return Math.round(withInterest);
  const rate = Math.min(0.5, Math.max(0, cardFee.rate));
  return Math.ceil((withInterest + Math.max(0, cardFee.fixedCents)) / (1 - rate) - 1e-9);
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

/** Cartão só a partir deste valor, mesmo que o painel configure menos. */
export const CARD_MIN_CENTS = 10_000;
export const MAX_INSTALLMENTS = 8;
/** Cada parcela tem pelo menos este valor (sobre o preço à vista). */
export const MIN_INSTALLMENT_CENTS = 10_000;

/**
 * Valor mínimo do pedido para pagar com cartão: o do painel
 * (creditMinOrderCents), nunca abaixo de R$ 100. Comparado com o valor à
 * vista no cartão (produtos - cupom + frete), no checkout e no servidor.
 */
export function cardMinCents(settingCents?: number | null): number {
  return Math.max(CARD_MIN_CENTS, settingCents ?? 0);
}

/** Máximo de parcelas para um valor à vista: até 8x, parcela mínima de R$ 100. */
export function maxInstallments(baseCents: number): number {
  return Math.max(1, Math.min(MAX_INSTALLMENTS, Math.floor(baseCents / MIN_INSTALLMENT_CENTS)));
}

/**
 * "Até Nx de R$ X sem juros" para um valor à vista (produto, carrinho): a
 * maior parcela sem juros e o valor de cada uma já com a taxa do cartão,
 * igual ao que o checkout cobra. n = 1 quando não há parcelamento sem juros.
 */
export function interestFreeHint(baseCents: number, fees?: Partial<PublicCardFees>): { n: number; perCents: number } {
  const max = maxInstallments(baseCents);
  let n = 1;
  for (let k = max; k >= 1; k--) { if (installmentFeeRate(k) === 0) { n = k; break; } }
  const total = computeCardTotalCents({ productsCents: baseCents, couponDiscountCents: 0, shippingCents: 0, feeRate: 0, cardFee: cardFeeFor(fees, n) });
  return { n, perCents: Math.round(total / n) };
}
