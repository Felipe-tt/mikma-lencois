/**
 * "Caixa" de frete — registra quanto foi realmente COBRADO do cliente em
 * frete (shippingCents, já com frete grátis aplicado quando for o caso) vs.
 * quanto foi de fato GASTO nas transportadoras (Melhor Envio / Uber Direct)
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

const LEDGER_REF = () => adminDb.collection('stats').doc('shipping-ledger');

export interface ShippingLedger {
  collectedCents: number;
  spentCents: number;
  balanceCents: number;
  updatedAt?: string;
}

/** Lê o saldo atual do caixa de frete. Nunca lança — retorna saldo 0 em caso de erro (fail-open pra não travar cotações). */
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

/** Registra que o cliente pagou X de frete (chamado quando o pagamento é confirmado). */
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
