import { checkPixStatus, getCheckoutStatus, getTransparent } from '@/lib/abacatepayApi';

export type ChargeVerdict =
  | { kind: 'paid' }
  | { kind: 'pending' }          // ainda não consta como paga: o gateway reenvia o aviso
  | { kind: 'rejected'; reason: string }
  | { kind: 'unknown' };         // consulta indisponível: decide pelo aviso assinado

/**
 * Confere na AbacatePay se a cobrança do aviso foi paga mesmo, com a chave
 * do ambiente do pedido (produção ou teste). O aviso é assinado, mas a
 * confirmação do pagamento passa a depender também da fonte.
 */
export async function verifyChargePaid(chargeId: string, orderId: string, sandbox: boolean): Promise<ChargeVerdict> {
  const res = chargeId.startsWith('bill_')
    ? await getCheckoutStatus(chargeId, sandbox)
    : chargeId.startsWith('card_')
      ? await getTransparent(chargeId, sandbox)
      : await checkPixStatus(chargeId, sandbox);
  if (!res.ok) {
    // 404 com a chave do ambiente do pedido: a cobrança não é desse ambiente
    // (ex.: cobrança de teste com o id de um pedido real) ou a API ainda não
    // a vê. Não confirma; o reenvio do aviso e a conferência dos pendentes
    // (syncOrderPayment, pelo id da cobrança do próprio pedido) resolvem.
    return res.status === 404 ? { kind: 'pending' } : { kind: 'unknown' };
  }
  const data = res.data as { status: string; externalId?: string | null };
  if (data.externalId && data.externalId !== orderId) return { kind: 'rejected', reason: 'cobrança de outro pedido' };
  if (data.status === 'PAID' || data.status === 'APPROVED') return { kind: 'paid' };
  if (data.status === 'PENDING' || data.status === 'ACTIVE') return { kind: 'pending' };
  return { kind: 'rejected', reason: `cobrança com status ${data.status}` };
}
