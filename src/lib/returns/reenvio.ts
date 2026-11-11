/**
 * Peça nova da troca: o que o cliente escolheu no lugar, quanto custa a
 * diferença e o frete do novo envio.
 *
 * Regras da loja (política de trocas):
 *  - a volta das peças é sempre por conta da loja;
 *  - troca sem defeito: o frete do novo envio é do cliente;
 *  - defeito: a loja paga tudo;
 *  - peça nova mais cara: o cliente paga a diferença (junto com o frete);
 *  - mais barata: a diferença abate o frete e o que sobrar volta por PIX.
 */
import { adminDb } from '@/lib/firebase/admin';
import { computeShippingOptions } from '@/lib/shipping-pricing';
import type { StoreSettings } from '@/lib/store-settings';
import type { OrderItem, ProductVariant } from '@/types';

export interface NovoEscolhido { productId: string; variantId: string; quantity: number }

/** Saldo da troca: positivo, o cliente paga; negativo, a loja devolve. */
export function saldoDaTroca(devolvidosCents: number, novosCents: number, freteCents: number): number {
  return novosCents - devolvidosCents + freteCents;
}

export const somaItens = (items: { unitPrice: number; quantity: number }[]) => items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

/** Confere as peças novas no catálogo (ativas, variante existe) e monta os itens do pedido. */
export async function resolverNovos(novos: NovoEscolhido[]): Promise<{ ok: true; items: OrderItem[]; pesoKg: number } | { ok: false; error: string }> {
  const ids = [...new Set(novos.map(n => n.productId))];
  const snaps = await Promise.all(ids.map(id => adminDb.collection('products').doc(id).get()));
  const prods = new Map(snaps.filter(s => s.exists).map(s => [s.id, s.data() as {
    name: string; price: number; active?: boolean; weightKg?: number; images?: string[]; variants?: ProductVariant[];
  }]));
  const items: OrderItem[] = [];
  let pesoKg = 0;
  for (const n of novos) {
    const p = prods.get(n.productId);
    if (!p || p.active === false) return { ok: false, error: 'Uma das peças escolhidas não está mais à venda.' };
    const variant = p.variants?.find(v => v.id === n.variantId);
    if (!variant) return { ok: false, error: 'Escolha o tamanho e a cor da peça nova.' };
    items.push({
      productId: n.productId, productName: p.name, sku: `${n.productId}_${variant.id}`, variant,
      quantity: n.quantity, unitPrice: p.price, ...(p.images?.[0] ? { image: p.images[0] } : {}),
    });
    pesoKg += (p.weightKg || 0.8) * n.quantity;
  }
  return { ok: true, items, pesoKg };
}

export interface FreteReenvio { carrier: string; label: string; priceCents: number; realPriceCents: number; estimatedDays: number; uberSandbox: boolean }

/**
 * Frete do novo envio até o endereço do pedido, pelo mesmo jeito que o
 * pedido chegou (se ainda estiver disponível), senão o mais barato. Sem
 * frete grátis: troca não conta para o mínimo do frete grátis.
 */
export async function cotarReenvio(cep: string, carrierOriginal: string | undefined, novosCents: number, pesoKg: number, settings: StoreSettings): Promise<FreteReenvio | null> {
  const r = await computeShippingOptions(cep, settings, novosCents, pesoKg, undefined, 0);
  const ok = r.options.filter(o => o.available && o.carrier !== 'pickup');
  const escolhida = ok.find(o => o.carrier === carrierOriginal) ?? [...ok].sort((a, b) => a.priceCents - b.priceCents)[0];
  if (!escolhida) return null;
  return {
    carrier: escolhida.carrier, label: escolhida.label, priceCents: escolhida.priceCents,
    realPriceCents: escolhida.realPriceCents ?? escolhida.priceCents, estimatedDays: escolhida.estimatedDays, uberSandbox: r.uberSandbox,
  };
}

export interface CalculoTroca {
  novos: OrderItem[];
  frete: FreteReenvio;
  /** O que o cliente paga de frete (0 em defeito). */
  freteCents: number;
  diferencaCents: number;
  saldoCents: number;
}

/** Tudo da peça nova de uma vez: itens, frete e saldo. */
export async function calcularTroca(
  order: { address?: { cep?: string } | null; delivery?: { carrier?: string | null } | null },
  devolvidos: { unitPrice: number; quantity: number }[],
  escolhidos: NovoEscolhido[],
  defeito: boolean,
  settings: StoreSettings,
): Promise<{ ok: true; calculo: CalculoTroca } | { ok: false; error: string }> {
  const r = await resolverNovos(escolhidos);
  if (!r.ok) return r;
  const novosCents = somaItens(r.items);
  const frete = await cotarReenvio(order.address?.cep ?? '', order.delivery?.carrier ?? undefined, novosCents, r.pesoKg, settings);
  if (!frete) return { ok: false, error: 'Não conseguimos calcular o frete do novo envio agora. Tente de novo em instantes.' };
  const freteCents = defeito ? 0 : frete.priceCents;
  const diferencaCents = novosCents - somaItens(devolvidos);
  return { ok: true, calculo: { novos: r.items, frete, freteCents, diferencaCents, saldoCents: saldoDaTroca(somaItens(devolvidos), novosCents, freteCents) } };
}
