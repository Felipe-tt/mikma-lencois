/**
 * "Caixa" de frete, registra quanto foi realmente COBRADO do cliente em
 * frete (shippingCents, já com frete grátis aplicado quando for o caso) vs.
 * quanto foi de fato GASTO nas transportadoras (Uber Direct real; Correios/
 * Jadlog estimado pelo valor cotado, no despacho manual)
 * no momento do despacho.
 *
 * saldo = collectedCents - spentCents
 *
 * Um saldo negativo grande significa que o frete grátis está saindo do
 * bolso da loja. Usado por computeShippingOptions() para desligar o frete
 * grátis automaticamente (silenciosamente, sem o cliente perceber) quando o
 * prejuízo acumulado passa do teto configurado em settings.freeShippingMaxLossCents.
 */
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isManualDispatch, type CarrierKey } from '@/lib/carriers';

const LEDGER_REF = () => adminDb.collection('stats').doc('shipping-ledger');

export interface ShippingLedger {
  collectedCents: number;
  spentCents: number;
  balanceCents: number;
  updatedAt?: string;
}

/** Lê o saldo atual do caixa de frete. Nunca lança, retorna saldo 0 em caso de erro (fail-open pra não travar cotações). */
export async function getShippingLedgerBalanceCents(): Promise<number> {
  try {
    const snap = await LEDGER_REF().get();
    if (!snap.exists) return 0;
    const data = snap.data()!;
    const collected = data.collectedCents ?? 0;
    const spent = data.spentCents ?? 0;
    return collected - spent;
  } catch (err) {
    console.warn('[shipping-ledger] falha ao ler saldo, assumindo 0:', err);
    return 0;
  }
}

export async function getShippingLedger(): Promise<ShippingLedger> {
  const snap = await LEDGER_REF().get();
  const data = snap.exists ? snap.data()! : {};
  const collectedCents = data.collectedCents ?? 0;
  const spentCents = data.spentCents ?? 0;
  return {
    collectedCents,
    spentCents,
    balanceCents: collectedCents - spentCents,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.(),
  };
}

/** Registra que o cliente pagou X de frete (chamado quando o pagamento é confirmado). Negativo: frete devolvido no estorno. */
export async function recordShippingCollected(cents: number): Promise<void> {
  if (!cents) return;
  await LEDGER_REF().set(
    { collectedCents: FieldValue.increment(cents), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/** Registra que a loja gastou X de verdade com a transportadora (chamado no despacho). */
export async function recordShippingSpent(cents: number): Promise<void> {
  if (!cents) return;
  await LEDGER_REF().set(
    { spentCents: FieldValue.increment(cents), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

// Pedido pago e não cancelado: o frete dele está no caixa. Cancelado pago
// vira estorno integral (frete incluso), então sai.
const COLLECTED_STATUSES = new Set(['paid', 'preparing', 'shipped', 'delivered']);
const SHIPPED_STATUSES = new Set(['shipped', 'delivered']);

export interface LedgerOrder {
  status?: string;
  shippingCents?: number;
  payment?: { abacateSandbox?: boolean };
  delivery?: { carrier?: string; shippingCostCents?: number; realPriceCents?: number; uberSandbox?: boolean };
}

/**
 * Caixa de frete a partir dos pedidos que existem. Pedido apagado some da
 * conta sozinho; pedido de teste (Dev Mode / sandbox da Uber) não entra.
 */
export function ledgerFromOrders(orders: LedgerOrder[]): { collectedCents: number; spentCents: number } {
  let collectedCents = 0;
  let spentCents = 0;
  for (const o of orders) {
    if (!o.payment?.abacateSandbox && COLLECTED_STATUSES.has(o.status ?? '')) {
      collectedCents += Math.max(0, o.shippingCents ?? 0);
    }
    const d = o.delivery;
    if (!d || d.uberSandbox) continue;
    if (typeof d.shippingCostCents === 'number') {
      // Gravado no despacho: a transportadora cobrou, mesmo se cancelou depois.
      spentCents += Math.max(0, d.shippingCostCents);
    } else if (SHIPPED_STATUSES.has(o.status ?? '') && isManualDispatch((d.carrier ?? '') as CarrierKey)) {
      // Pedidos antigos, de antes do campo: o valor cotado era o custo estimado.
      spentCents += Math.max(0, d.realPriceCents ?? 0);
    }
  }
  return { collectedCents, spentCents };
}

/** Refaz o caixa de frete lendo os pedidos (chamado ao apagar pedido e ao abrir o painel). */
export async function recomputeShippingLedger(): Promise<ShippingLedger> {
  const snap = await adminDb.collection('orders')
    .select('status', 'shippingCents', 'payment.abacateSandbox', 'delivery.carrier', 'delivery.shippingCostCents', 'delivery.realPriceCents', 'delivery.uberSandbox')
    .get();
  const { collectedCents, spentCents } = ledgerFromOrders(snap.docs.map(d => d.data() as LedgerOrder));
  await LEDGER_REF().set({ collectedCents, spentCents, updatedAt: FieldValue.serverTimestamp() });
  return { collectedCents, spentCents, balanceCents: collectedCents - spentCents, updatedAt: new Date().toISOString() };
}
