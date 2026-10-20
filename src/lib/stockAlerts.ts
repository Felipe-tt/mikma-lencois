import { createHash } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { sendEmail, emailEnabled } from '@/lib/email';
import { emailLayout, emailParagraph, emailCta, emailSignature, BASE_URL } from '@/lib/email/layout';
import { escapeHtml } from '@/lib/html';

/**
 * "Avise-me quando chegar": pedidos de aviso de produto esgotado.
 * Coleção `stockAlerts`, só o servidor lê e grava (sem regra no Firestore,
 * então o SDK do cliente não acessa). Cada aviso é mandado uma vez e o
 * registro é apagado em seguida: o e-mail não fica guardado à toa.
 */

export const STOCK_ALERTS = 'stockAlerts';

/** Um pedido por produto e e-mail: pedir de novo só atualiza a data. */
export function stockAlertId(productId: string, email: string): string {
  return createHash('sha256').update(`${productId}|${email.trim().toLowerCase()}`).digest('hex').slice(0, 40);
}

interface AlertDoc { productId: string; email: string; attempts?: number }

/** Disponível para venda (quantidade menos reservado) somando as variações. */
async function availableFor(productId: string): Promise<number> {
  const snap = await adminDb.collection('inventory').where('productId', '==', productId).get();
  return snap.docs.reduce((n, d) => n + Math.max(0, (d.data().quantity ?? 0) - (d.data().reserved ?? 0)), 0);
}

export function stockAlertEmail(productName: string, productUrl: string): { subject: string; html: string; text: string } {
  const name = escapeHtml(productName);
  return {
    subject: `Voltou ao estoque: ${productName}`,
    html: emailLayout(
      emailParagraph(`Boa notícia: <strong>${name}</strong> voltou ao estoque.`)
      + emailParagraph('As unidades são limitadas e vendem por ordem de compra, então vale garantir logo.', { muted: true })
      + emailCta('Ver o produto', productUrl)
      + emailSignature(),
      { preheader: `${productName} voltou ao estoque`, footerNote: 'Você pediu este aviso na página do produto. Ele é enviado uma vez só.' },
    ),
    text: `${productName} voltou ao estoque.\n\nVer o produto: ${productUrl}\n\nVocê pediu este aviso na página do produto. Ele é enviado uma vez só.`,
  };
}

/**
 * Confere os pedidos pendentes e avisa quem pediu produto que voltou.
 * Roda pelo cron (a cada 15 min). Falha de um e-mail não para os outros:
 * o pedido fica para a próxima rodada.
 */
export async function notifyStockAlerts(limit = 300): Promise<{ checked: number; notified: number; errors: number }> {
  const result = { checked: 0, notified: 0, errors: 0 };
  if (!emailEnabled()) return result;

  const snap = await adminDb.collection(STOCK_ALERTS).limit(limit).get();
  result.checked = snap.size;
  const byProduct = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const d of snap.docs) {
    const { productId } = d.data() as AlertDoc;
    if (!productId) continue;
    byProduct.set(productId, [...(byProduct.get(productId) ?? []), d]);
  }

  for (const [productId, docs] of byProduct) {
    try {
      const product = await adminDb.collection('products').doc(productId).get();
      // Produto excluído: o aviso não tem mais sentido.
      if (!product.exists) { await Promise.all(docs.map(d => d.ref.delete())); continue; }
      if (product.data()!.active === false) continue;
      if ((await availableFor(productId)) <= 0) continue;

      const { subject, html, text } = stockAlertEmail(String(product.data()!.name ?? 'Produto'), `${BASE_URL}/produtos/${productId}`);
      for (const d of docs) {
        try {
          await sendEmail({ to: (d.data() as AlertDoc).email, subject, html, text });
          await d.ref.delete();
          result.notified++;
        } catch (err) {
          result.errors++;
          console.error('[stock-alerts] falha ao avisar', d.id, err);
          // Tenta de novo nas próximas rodadas, até 5 vezes (e-mail que não
          // existe falharia para sempre).
          const attempts = ((d.data().attempts as number | undefined) ?? 0) + 1;
          await (attempts >= 5 ? d.ref.delete() : d.ref.update({ attempts })).catch(() => {});
        }
      }
    } catch (err) {
      result.errors++;
      console.error('[stock-alerts] falha no produto', productId, err);
    }
  }
  return result;
}
