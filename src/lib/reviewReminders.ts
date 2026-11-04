import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendEmail, emailEnabled } from '@/lib/email';
import { BASE_URL, CONTACT_EMAIL, emailCta, emailLayout, emailParagraph, emailSection, emailSignature, shortOrderId } from '@/lib/email/layout';
import { escapeHtml } from '@/lib/html';

/**
 * Lembrete de avaliação: alguns dias depois da entrega, um e-mail só para
 * quem ainda não avaliou os produtos do pedido. O e-mail de "entregue" já
 * convida a avaliar; este é o único lembrete (o pedido fica marcado com
 * `reviewReminderAt` e nunca recebe outro).
 *
 * Só vai para quem consegue avaliar: conta com login (convidado anônimo não
 * entra de novo para avaliar) e pedido com produto ainda sem avaliação.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Espera depois da entrega: tempo de usar os lençóis. */
export const REMINDER_AFTER_DAYS = 5;
/** Entrega mais antiga que isso não recebe lembrete (evita mandar para pedidos velhos). */
export const REMINDER_WINDOW_DAYS = 21;
const MAX_PER_RUN = 100;
/** Erros do Resend que dizem respeito ao destinatário: marca o pedido e segue. */
const RECIPIENT_ERRORS = new Set(['validation_error', 'missing_required_field', 'invalid_to_address']);

interface PendingProduct { productId: string; productName: string }

export function reviewReminderEmail(name: string, orderId: string, products: PendingProduct[]): { subject: string; html: string; text: string } {
  const id = shortOrderId(orderId);
  const one = products.length === 1;
  const links = products.map(p => ({ ...p, url: `${BASE_URL}/produtos/${encodeURIComponent(p.productId)}#avaliacoes` }));
  const list = one ? '' : `<ul style="margin:0 0 16px;padding-left:20px;">${links
    .map(p => `<li style="margin:0 0 8px;"><a href="${p.url}" style="color:inherit;">${escapeHtml(p.productName)}</a></li>`)
    .join('')}</ul>`;
  const html = emailLayout(
    emailSection({
      eyebrow: `Pedido #${id}`,
      title: 'Como estão os seus lençóis?',
      html: emailParagraph(`Olá, <strong>${escapeHtml(name)}</strong>! Já faz alguns dias que o seu pedido chegou. Conta pra gente o que achou${one ? ` do <strong>${escapeHtml(links[0].productName)}</strong>` : ''}?`)
        + emailParagraph('Sua avaliação ajuda outras pessoas a escolher e leva menos de um minuto.', { muted: true })
        + list
        + (one ? emailCta('Avaliar minha compra', links[0].url) : emailCta('Ver meus pedidos', `${BASE_URL}/conta/pedidos`)),
    }) + emailSignature(),
    { preheader: 'Leva menos de um minuto e ajuda outras pessoas a escolher.', footerNote: 'Este é o único lembrete de avaliação deste pedido.' },
  );
  const text = `Olá, ${name}! Já faz alguns dias que o seu pedido #${id} chegou. Conta pra gente o que achou:\n\n`
    + links.map(p => `${p.productName}: ${p.url}`).join('\n')
    + '\n\nEste é o único lembrete de avaliação deste pedido.';
  return { subject: one ? `O que achou do ${links[0].productName}?` : 'O que achou da sua compra?', html, text };
}

function toMillis(v: unknown): number {
  if (!v) return NaN;
  if (typeof v === 'string') return Date.parse(v);
  if (v instanceof Date) return v.getTime();
  const ts = v as { toMillis?: () => number };
  return typeof ts.toMillis === 'function' ? ts.toMillis() : NaN;
}

export async function sendReviewReminders(now = new Date()): Promise<{ checked: number; sent: number; skipped: number; errors: number }> {
  const result = { checked: 0, sent: 0, skipped: 0, errors: 0 };
  if (!emailEnabled()) return result;

  const newest = new Date(now.getTime() - REMINDER_AFTER_DAYS * DAY);
  const oldest = new Date(now.getTime() - REMINDER_WINDOW_DAYS * DAY);
  const snap = await adminDb.collection('orders')
    .where('status', '==', 'delivered')
    .where('delivery.deliveredAt', '>=', oldest)
    .where('delivery.deliveredAt', '<=', newest)
    .orderBy('delivery.deliveredAt')
    .limit(500)
    .get();

  for (const doc of snap.docs) {
    if (result.sent >= MAX_PER_RUN) break;
    const order = doc.data() as {
      userId?: string; reviewReminderAt?: unknown; items?: { productId?: string; productName?: string }[];
      delivery?: { deliveredAt?: unknown };
    };
    if (order.reviewReminderAt) continue;
    const delivered = toMillis(order.delivery?.deliveredAt);
    if (!(delivered >= oldest.getTime() && delivered <= newest.getTime())) continue;
    result.checked++;
    const mark = (reason: string) => doc.ref.update({ reviewReminderAt: now.toISOString(), reviewReminderResult: reason }).catch(() => {});

    try {
      const products = new Map<string, string>();
      for (const it of order.items ?? []) if (it.productId) products.set(it.productId, it.productName || 'seu produto');
      const reviewed = await adminDb.collection('reviews').where('orderId', '==', doc.id).get();
      for (const r of reviewed.docs) products.delete(String(r.data().productId));
      if (!products.size || !order.userId) { result.skipped++; await mark(products.size ? 'sem conta' : 'ja avaliado'); continue; }

      // Convidado (conta anônima) não consegue entrar de novo para avaliar.
      const user = await adminAuth.getUser(order.userId).catch(() => null);
      const profile = (await adminDb.collection('users').doc(order.userId).get()).data() as { email?: string; name?: string } | undefined;
      const email = profile?.email || user?.email;
      if (!user || !user.providerData.length || !email) { result.skipped++; await mark('sem login'); continue; }

      const name = (profile?.name ?? user.displayName ?? '').split(' ')[0] || 'cliente';
      const payload = reviewReminderEmail(name, doc.id, [...products].map(([productId, productName]) => ({ productId, productName })));
      try {
        await sendEmail({ to: email, ...payload, from: 'noreply', replyTo: CONTACT_EMAIL });
      } catch (err) {
        result.errors++;
        const code = (err as { code?: string }).code ?? '';
        if (!RECIPIENT_ERRORS.has(code)) {
          // Limite ou instabilidade do provedor: tenta de novo amanhã.
          console.error('[review-reminders] envio interrompido', code, err);
          return result;
        }
        await mark('email recusado');
        continue;
      }
      await mark('enviado');
      result.sent++;
    } catch (err) {
      result.errors++;
      console.error('[review-reminders] falha no pedido', doc.id, err);
    }
  }
  return result;
}
