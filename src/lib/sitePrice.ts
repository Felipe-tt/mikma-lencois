/**
 * Preço do site a partir do preço da loja física: acréscimo em % e, se
 * quiser, final ",90" para o preço parecer escolhido (103,95 → 104,90).
 * Tudo em centavos.
 */
export type SitePriceRounding = 'exato' | '90';

export interface SitePriceRule {
  /** Acréscimo em %, 0 a 100. */
  pct: number;
  rounding: SitePriceRounding;
}

export function normalizeRule(rule: Partial<SitePriceRule> | undefined): SitePriceRule {
  const pct = Number(rule?.pct);
  return {
    pct: Number.isFinite(pct) ? Math.min(100, Math.max(0, Math.round(pct * 100) / 100)) : 0,
    rounding: rule?.rounding === '90' ? '90' : 'exato',
  };
}

export function sitePriceCents(storeCents: number, rule: Partial<SitePriceRule> | undefined): number {
  const { pct, rounding } = normalizeRule(rule);
  if (!Number.isFinite(storeCents) || storeCents <= 0) return 0;
  if (pct === 0) return Math.round(storeCents);
  const exact = Math.round(storeCents * (1 + pct / 100));
  if (rounding === 'exato') return exact;
  // Próximo preço terminado em ,90 (nunca abaixo do valor com acréscimo).
  const reais = Math.floor(exact / 100);
  return exact % 100 <= 90 ? reais * 100 + 90 : (reais + 1) * 100 + 90;
}
