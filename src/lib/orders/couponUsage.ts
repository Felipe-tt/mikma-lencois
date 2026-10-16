import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Devolve 1 uso de cupom (usedCount - 1) quando um pedido que consumiu o
 * cupom não chega a ser pago: falha no gateway logo após criar o pedido,
 * cancelamento pelo cliente/lojista antes do pagamento ou cancelamento
 * automático por falta de pagamento.
 *
 * Sem isso, cada PIX abandonado "gastava" um uso pra sempre e cupons com
 * maxUses se esgotavam sem nenhuma venda de verdade.
 *
 * Best-effort: nunca lança (o fluxo que chama já concluiu o que importa).
 * Transação pra nunca deixar usedCount negativo.
 */
export async function releaseCouponUse(couponCode: string | null | undefined): Promise<void> {
  if (!couponCode) return;
  const ref = adminDb.collection('coupons').doc(couponCode);
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      if (((snap.data()!.usedCount as number | undefined) ?? 0) <= 0) return;
      tx.update(ref, { usedCount: FieldValue.increment(-1) });
    });
  } catch (err) {
    console.error('[coupon] falha ao devolver uso do cupom', couponCode, err);
  }
}
