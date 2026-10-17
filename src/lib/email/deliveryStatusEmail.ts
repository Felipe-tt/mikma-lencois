import { adminAuth } from '@/lib/firebase/admin';
import { sendEmail, emailEnabled } from '@/lib/email';
import { deliveryStatusEmailHtml } from '@/lib/email-templates';
import { CONTACT_EMAIL, STORE_NAME } from '@/lib/email/layout';

interface OrderLike {
  userId?: string;
  customerName?: string;
  customerEmail?: string;
}

/**
 * Manda um e-mail curto pro cliente quando a entrega Uber Direct muda pra
 * um status que ele realmente precisa saber (saiu pra entrega / chegou).
 * Best-effort: nunca lança, falha de e-mail não pode derrubar o webhook
 * (o Uber reenviaria o evento em loop se recebesse erro 5xx daqui).
 */
export async function notifyCustomerDeliveryStatus(
  orderId: string,
  order: OrderLike,
  uberStatus: 'pickup_complete' | 'delivered' | 'canceled' | 'returned'
): Promise<void> {
  if (!emailEnabled()) return;

  try {
    let email = order.customerEmail;
    let name = order.customerName || 'Cliente';

    if (!email && order.userId) {
      try {
        const authUser = await adminAuth.getUser(order.userId);
        email = authUser.email ?? undefined;
        name = authUser.displayName || name;
      } catch {
        // conta pode ter sido removida, sem problema, só não manda
      }
    }
    if (!email) return;

    const shortId = orderId.slice(-8).toUpperCase();
    const orderUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://mikma.com.br'}/pedidos/${orderId}`;

    const COPY: Record<typeof uberStatus, { subject: string; headline: string; body: string; button: string }> = {
      pickup_complete: {
        subject: `Pedido #${shortId} saiu para entrega | ${STORE_NAME}`,
        headline: 'A caminho',
        body: `O motoboy já pegou seu pedido na loja e está indo até você. Acompanhe em tempo real no mapa.`,
        button: 'Acompanhar entrega',
      },
      delivered: {
        subject: `Pedido #${shortId} entregue | ${STORE_NAME}`,
        headline: 'Entregue',
        body: `Seu pedido foi entregue. Esperamos que você aproveite! Se algo não estiver certo, é só responder este e-mail.`,
        button: 'Ver pedido',
      },
      canceled: {
        subject: `Atualização do pedido #${shortId} | ${STORE_NAME}`,
        headline: 'Aviso',
        body: `Houve um imprevisto com o motoboy da sua entrega. Já estamos providenciando um novo despacho, nenhuma ação é necessária da sua parte.`,
        button: 'Ver pedido',
      },
      returned: {
        subject: `Atualização do pedido #${shortId} | ${STORE_NAME}`,
        headline: 'Aviso',
        body: `Seu pedido não pôde ser entregue e voltou para a loja. Vamos entrar em contato para reagendar, nenhuma ação é necessária da sua parte agora.`,
        button: 'Ver pedido',
      },
    };

    const copy = COPY[uberStatus];

    await sendEmail({
      to: email,
      subject: copy.subject,
      text: `${copy.body}\n\nVeja os detalhes: ${orderUrl}`,
      html: deliveryStatusEmailHtml({
        greetingName: name,
        headline: copy.headline,
        bodyText: copy.body,
        buttonLabel: copy.button,
        actionUrl: orderUrl,
      }),
      replyTo: CONTACT_EMAIL,
    });
  } catch (err) {
    console.error('[notifyCustomerDeliveryStatus] falha ao enviar e-mail (best-effort, ignorado):', err);
  }
}
