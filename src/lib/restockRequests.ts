import { createHash } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { sendEmail, emailEnabled } from '@/lib/email';
import { emailLayout, emailSection, emailParagraph, emailCta, emailSignature, BASE_URL } from '@/lib/email/layout';
import { escapeHtml } from '@/lib/html';
import { SIZE_LABEL } from '@/lib/productOptions';

/**
 * "Avise-me quando chegar": pedidos de aviso de uma variação esgotada.
 * Coleção própria (`restockRequests`; `stockAlerts` é do alerta de estoque
 * baixo do painel) e fechada nas regras do Firestore: só o servidor lê e
 * grava. Cada aviso é mandado uma vez e o registro é apagado em seguida.
 */

export const RESTOCK_REQUESTS = 'restockRequests';
/** Pedido sem resposta depois disso é descartado (produto não voltou). */
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
/** Erros do Resend que dizem respeito ao destinatário: contam tentativa. */
const RECIPIENT_ERRORS = new Set(['validation_error', 'missing_required_field', 'invalid_to_address']);

/** Um pedido por variação e e-mail: pedir de novo só atualiza a data. */
export function restockRequestId(productId: string, variantId: string, email: string): string {
  return createHash('sha256').update(`${productId}|${variantId}|${email.trim().toLowerCase()}`).digest('hex').slice(0, 40);
}

interface RequestDoc { productId: string; variantId: string; email: string; createdAt: string; attempts?: number }

export function restockEmail(productName: string, variantLabel: string, productUrl: string): { subject: string; html: string; text: string } {
  const full = variantLabel ? `${productName} (${variantLabel})` : productName;
  const name = escapeHtml(full);
  return {
    subject: `Voltou ao estoque: ${full}`,
    html: emailLayout(
      emailSection({
        eyebrow: 'Avise-me quando chegar',
        title: 'Voltou ao estoque',
        html: emailParagraph(`Boa notícia: <strong>${name}</strong> está disponível de novo.`)
          + emailParagraph('As unidades são limitadas e vendem por ordem de compra, então vale garantir logo.', { muted: true })
          + emailCta('Ver o produto', productUrl),
      }) + emailSignature(),
      { preheader: `${full} voltou ao estoque`, footerNote: 'Você pediu este aviso na página do produto. Ele é enviado uma vez só.' },
    ),
    text: `${full} voltou ao estoque.\n\nVer o produto: ${productUrl}\n\nVocê pediu este aviso na página do produto. Ele é enviado uma vez só.`,
  };
}

/**
 * Confere os pedidos pendentes e avisa quem pediu uma variação que voltou.
 * Roda de hora em hora. Lê todos os pedidos (em páginas), agrupa por SKU e
 * lê só o estoque desses SKUs. Falha passageira do e-mail encerra a rodada
 * sem gastar tentativa; e-mail recusado conta tentativa (até 5).
 */
export async function notifyRestockRequests(): Promise<{ checked: number; notified: number; expired: number; errors: number }> {
  const result = { checked: 0, notified: 0, expired: 0, errors: 0 };
  if (!emailEnabled()) return result;

  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (let page = 0; page < 20; page++) {
    let q = adminDb.collection(RESTOCK_REQUESTS).orderBy('__name__').limit(500);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    docs.push(...snap.docs);
    if (snap.size < 500) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  result.checked = docs.length;

  const now = Date.now();
  const bySku = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const d of docs) {
    const r = d.data() as RequestDoc;
    if (!r.productId || !r.variantId || !r.email || now - Date.parse(r.createdAt || '') > MAX_AGE_MS) {
      await d.ref.delete().catch(() => {});
      result.expired++;
      continue;
    }
    const sku = `${r.productId}_${r.variantId}`;
    bySku.set(sku, [...(bySku.get(sku) ?? []), d]);
  }

  for (const [sku, group] of bySku) {
    const { productId, variantId } = group[0].data() as RequestDoc;
    try {
      const inv = await adminDb.collection('inventory').doc(sku).get();
      const available = inv.exists ? (inv.data()!.quantity ?? 0) - (inv.data()!.reserved ?? 0) : 0;
      if (available <= 0) continue;
      const product = await adminDb.collection('products').doc(productId).get();
      const p = product.data();
      // Mesmo critério da página do produto: só produto ativo aparece.
      if (!p || p.active !== true) continue;
      const v = (p.variants as Array<{ id: string; size?: string; colorName?: string }> | undefined)?.find(x => x.id === variantId);
      const label = v ? [v.size ? (SIZE_LABEL[v.size] ?? v.size) : '', v.colorName ?? ''].filter(Boolean).join(' · ') : '';
      const { subject, html, text } = restockEmail(String(p.name ?? 'Produto'), label, `${BASE_URL}/produtos/${productId}`);

      for (const d of group) {
        try {
          await sendEmail({ to: (d.data() as RequestDoc).email, subject, html, text });
          await d.ref.delete();
          result.notified++;
        } catch (err) {
          result.errors++;
          const code = (err as { code?: string }).code ?? '';
          if (!RECIPIENT_ERRORS.has(code)) {
            // Limite ou instabilidade do provedor: para e tenta na próxima hora.
            console.error('[restock] envio interrompido', code, err);
            return result;
          }
          const attempts = ((d.data() as RequestDoc).attempts ?? 0) + 1;
          await (attempts >= 5 ? d.ref.delete() : d.ref.update({ attempts })).catch(() => {});
        }
      }
    } catch (err) {
      result.errors++;
      console.error('[restock] falha no SKU', sku, err);
    }
  }
  return result;
}
