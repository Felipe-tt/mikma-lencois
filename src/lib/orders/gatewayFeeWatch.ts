import { adminDb } from '@/lib/firebase/admin';
import { normalizeFees } from '@/lib/gatewayFees';
import { repriceSite } from '@/lib/repriceSite';
import { formatCurrency } from '@/lib/utils/format';

const DAY = 86_400_000;

/**
 * Confere a taxa do PIX que a AbacatePay devolveu numa cobrança real
 * (platformFee, em centavos). Igual à salva: só marca a data da conferência
 * (no máximo uma vez por dia). Diferente: salva a nova, avisa no painel e,
 * se a loja repassa a taxa no preço, refaz os preços do site.
 * Best-effort: nunca derruba a criação do PIX.
 */
export async function watchPixFee(platformFee: unknown): Promise<void> {
  const fee = Number(platformFee);
  if (!Number.isInteger(fee) || fee < 0 || fee > 1000) return;
  try {
    const ref = adminDb.collection('settings').doc('store');
    const data = (await ref.get()).data() ?? {};
    const current = normalizeFees(data);
    const now = new Date();
    if (fee === current.abacateFeePixCents) {
      const last = Date.parse(String(data.abacateFeeCheckedAt ?? ''));
      if (!Number.isFinite(last) || now.getTime() - last > DAY) await ref.set({ abacateFeeCheckedAt: now.toISOString() }, { merge: true });
      return;
    }
    const day = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
    await ref.set({
      abacateFeePixCents: fee,
      abacateFeeCheckedAt: now.toISOString(),
      abacateFeeNotice: `Em ${day} a AbacatePay passou a cobrar ${formatCurrency(fee)} por PIX (antes ${formatCurrency(current.abacateFeePixCents)}). A taxa salva foi atualizada${current.abacateFeePixInPrice ? ' e os preços do site também' : ''}.`,
    }, { merge: true });
    if (current.abacateFeePixInPrice) await repriceSite();
  } catch (err) {
    console.warn('[taxa PIX] não deu para conferir:', err instanceof Error ? err.message : err);
  }
}
