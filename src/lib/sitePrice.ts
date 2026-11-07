/**
 * Preço do site a partir do preço da loja física: acréscimo em %, a taxa
 * do PIX (se a loja repassa) e, se quiser, final ",90" para o preço
 * parecer escolhido (103,95 vira 104,90). Tudo em centavos.
 */
import { pixFeeInPriceCents } from '@/lib/gatewayFees';

export type SitePriceRounding = 'exato' | '90';

export interface SitePriceRule {
  /** Acréscimo em %, 0 a 100. */
  pct: number;
  rounding: SitePriceRounding;
  /** Somado depois do acréscimo e antes do arredondamento (taxa do PIX). */
  feeCents?: number;
}

export function normalizeRule(rule: Partial<SitePriceRule> | undefined): SitePriceRule {
  const pct = Number(rule?.pct);
  const fee = Math.max(0, Math.round(Number(rule?.feeCents) || 0));
  return {
    pct: Number.isFinite(pct) ? Math.min(100, Math.max(0, Math.round(pct * 100) / 100)) : 0,
    rounding: rule?.rounding === '90' ? '90' : 'exato',
    ...(fee > 0 ? { feeCents: fee } : {}),
  };
}

export function sitePriceCents(storeCents: number, rule: Partial<SitePriceRule> | undefined): number {
  const { pct, rounding, feeCents = 0 } = normalizeRule(rule);
  if (!Number.isFinite(storeCents) || storeCents <= 0) return 0;
  if (pct === 0 && feeCents === 0) return Math.round(storeCents);
  const exact = Math.round(storeCents * (1 + pct / 100)) + feeCents;
  if (rounding === 'exato') return exact;
  // Próximo preço terminado em ,90 (nunca abaixo do valor com acréscimo).
  const reais = Math.floor(exact / 100);
  return exact % 100 <= 90 ? reais * 100 + 90 : (reais + 1) * 100 + 90;
}

/** A regra salva nas Configurações (acréscimo, arredondamento e taxa do PIX). */
export function siteRuleFrom(s: Record<string, unknown> | undefined): SitePriceRule {
  return normalizeRule({
    pct: s?.sitePriceMarkupPct as number,
    rounding: s?.sitePriceRounding as SitePriceRounding,
    feeCents: pixFeeInPriceCents(s as never),
  });
}
