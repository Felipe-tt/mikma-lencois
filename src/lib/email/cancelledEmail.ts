import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendEmail, emailEnabled } from '@/lib/email';
import { buildCancelled, buildRefunded } from '@/lib/email/orderStatusEmails';
import { CONTACT_EMAIL, type EmailItem, type EmailMoney } from '@/lib/email/layout';

/**
 * Avisa o cliente que o pedido foi cancelado (pela loja ou por ele mesmo).
 * Antes nenhum dos dois cancelamentos mandava e-mail: quem já tinha pago
 * descobria por acaso, sem saber do reembolso.
 *
 * Best-effort: chamado depois do commit da transação e nunca lança, uma
 * falha de e-mail não pode desfazer nem quebrar o cancelamento.
 */
export async function notifyOrderCancelled(
  orderId: string,
  order: { userId?: string; items?: unknown; totalCents?: number } & EmailMoney,
  opts: { refund: boolean; byCustomer?: boolean },
): Promise<void> {
  if (!emailEnabled() || !order.userId) return;
  try {
    const uSnap = await adminDb.collection('users').doc(order.userId).get();
    const userData = uSnap.data() ?? {};
    let email = userData.email as string | undefined;
    if (!email) {
      try { email = (await adminAuth.getUser(order.userId)).email ?? undefined; } catch { /* conta removida */ }
    }
    if (!email) return;
    const firstName = String(userData.name ?? userData.displayName ?? '').split(' ')[0] || 'cliente';
    const payload = buildCancelled(
      {
        id: orderId, items: (order.items ?? []) as EmailItem[], totalCents: order.totalCents ?? 0,
        productsCents: order.productsCents, shippingCents: order.shippingCents, pixDiscountCents: order.pixDiscountCents,
        couponDiscountCents: order.couponDiscountCents, discountCents: order.discountCents, couponCode: order.couponCode,
      },
      firstName,
      opts,
    );
    await sendEmail({
      to: email,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      from: 'noreply',
      replyTo: CONTACT_EMAIL,
    });
  } catch (err) {
    console.error(`[notifyOrderCancelled] falha ao enviar e-mail do pedido ${orderId} (ignorado):`, err);
  }
}

/**
 * Avisa o cliente que o estorno foi concluído (pelo painel, por fora ou
 * direto na AbacatePay). Antes ele só recebia "será devolvido" no
 * cancelamento e nunca sabia quando o dinheiro voltou. Best-effort.
 */
export async function notifyOrderRefunded(
  orderId: string,
  order: { userId?: string; totalCents?: number; payment?: { method?: string } },
  viaGateway: boolean,
): Promise<void> {
  if (!emailEnabled() || !order.userId) return;
  try {
    const uSnap = await adminDb.collection('users').doc(order.userId).get();
    const userData = uSnap.data() ?? {};
    let email = userData.email as string | undefined;
    if (!email) {
      try { email = (await adminAuth.getUser(order.userId)).email ?? undefined; } catch { /* conta removida */ }
    }
    if (!email) return;
    const firstName = String(userData.name ?? userData.displayName ?? '').split(' ')[0] || 'cliente';
    const method = !viaGateway ? 'outro' : order.payment?.method === 'card' ? 'card' : 'pix';
    const payload = buildRefunded({ id: orderId, totalCents: order.totalCents ?? 0 }, firstName, method);
    await sendEmail({ to: email, subject: payload.subject, text: payload.text, html: payload.html, from: 'noreply', replyTo: CONTACT_EMAIL });
  } catch (err) {
    console.error(`[notifyOrderRefunded] falha ao enviar e-mail do pedido ${orderId} (ignorado):`, err);
  }
}
