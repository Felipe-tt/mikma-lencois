/**
 * Taxas da AbacatePay (tabela pública: PIX R$ 0,80 por cobrança; cartão
 * 3,5% + R$ 0,60 à vista, 4% de 2x a 6x, 4,5% de 7x a 12x).
 *
 * PIX: a taxa entra no preço do site (cada produto), junto do acréscimo.
 * Cartão: a taxa entra no total do pedido no cartão, pela parcela escolhida,
 * de modo que a loja recebe o mesmo que receberia sem a taxa.
 *
 * A taxa do PIX é conferida em toda cobrança real (a AbacatePay devolve o
 * valor cobrado em platformFee). Mudou, o painel atualiza sozinho e avisa.
 */

export interface GatewayFeeSettings {
  abacateFeePixCents: number;
  abacateFeePixInPrice: boolean;
  abacateFeeCardFixedCents: number;
  abacateFeeCardPct1x: number;
  abacateFeeCardPct2a6: number;
  abacateFeeCardPct7a12: number;
  abacateFeeCardToCustomer: boolean;
}

export const GATEWAY_FEE_DEFAULTS: GatewayFeeSettings = {
  abacateFeePixCents: 80,
  abacateFeePixInPrice: true,
  abacateFeeCardFixedCents: 60,
  abacateFeeCardPct1x: 3.5,
  abacateFeeCardPct2a6: 4,
  abacateFeeCardPct7a12: 4.5,
  abacateFeeCardToCustomer: true,
};

const num = (v: unknown, fallback: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(max, n) : fallback;
};

/** Valores do banco já conferidos (faltando, vale a tabela pública). */
export function normalizeFees(s: Partial<Record<keyof GatewayFeeSettings, unknown>> | undefined): GatewayFeeSettings {
  const d = GATEWAY_FEE_DEFAULTS;
  return {
    abacateFeePixCents: Math.round(num(s?.abacateFeePixCents, d.abacateFeePixCents, 1000)),
    abacateFeePixInPrice: s?.abacateFeePixInPrice === undefined ? d.abacateFeePixInPrice : s.abacateFeePixInPrice === true,
    abacateFeeCardFixedCents: Math.round(num(s?.abacateFeeCardFixedCents, d.abacateFeeCardFixedCents, 1000)),
    abacateFeeCardPct1x: num(s?.abacateFeeCardPct1x, d.abacateFeeCardPct1x, 20),
    abacateFeeCardPct2a6: num(s?.abacateFeeCardPct2a6, d.abacateFeeCardPct2a6, 20),
    abacateFeeCardPct7a12: num(s?.abacateFeeCardPct7a12, d.abacateFeeCardPct7a12, 20),
    abacateFeeCardToCustomer: s?.abacateFeeCardToCustomer === undefined ? d.abacateFeeCardToCustomer : s.abacateFeeCardToCustomer === true,
  };
}

/** Quanto do PIX vai no preço de cada produto (0 se a loja não repassa). */
export function pixFeeInPriceCents(s: Partial<Record<keyof GatewayFeeSettings, unknown>> | undefined): number {
  const f = normalizeFees(s);
  return f.abacateFeePixInPrice ? f.abacateFeePixCents : 0;
}

/** Percentual do cartão (em %) para o número de parcelas. */
export function cardFeePct(f: GatewayFeeSettings, installments: number): number {
  if (installments <= 1) return f.abacateFeeCardPct1x;
  if (installments <= 6) return f.abacateFeeCardPct2a6;
  return f.abacateFeeCardPct7a12;
}

export interface CardFee {
  fixedCents: number;
  /** Fração, ex: 0.035 para 3,5%. */
  rate: number;
}

export const NO_CARD_FEE: CardFee = { fixedCents: 0, rate: 0 };

/** Taxa do cartão que o cliente paga nesse parcelamento (zero se a loja absorve). */
export function cardFeeFor(s: Partial<Record<keyof GatewayFeeSettings, unknown>> | undefined, installments: number): CardFee {
  const f = normalizeFees(s);
  if (!f.abacateFeeCardToCustomer) return NO_CARD_FEE;
  return { fixedCents: f.abacateFeeCardFixedCents, rate: cardFeePct(f, installments) / 100 };
}

/** Só os campos de taxa, para mandar ao navegador (checkout, carrinho, produto). */
export function publicCardFees(s: Partial<Record<keyof GatewayFeeSettings, unknown>> | undefined) {
  const f = normalizeFees(s);
  return {
    abacateFeeCardToCustomer: f.abacateFeeCardToCustomer,
    abacateFeeCardFixedCents: f.abacateFeeCardFixedCents,
    abacateFeeCardPct1x: f.abacateFeeCardPct1x,
    abacateFeeCardPct2a6: f.abacateFeeCardPct2a6,
    abacateFeeCardPct7a12: f.abacateFeeCardPct7a12,
  };
}
export type PublicCardFees = ReturnType<typeof publicCardFees>;
