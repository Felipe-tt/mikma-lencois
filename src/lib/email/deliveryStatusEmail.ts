import { adminAuth } from '@/lib/firebase/admin';
import { sendEmail, emailEnabled } from '@/lib/email';
import { deliveryStatusEmailHtml } from '@/lib/email-templates';

interface OrderLike {
  userId?: string;
  customerName?: string;
  customerEmail?: string;
}

/**
 * Manda um e-mail curto pro cliente quando a entrega Uber Direct muda pra
 * um status que ele realmente precisa saber (saiu pra entrega / chegou).
 * Best-effort: nunca lança — falha de e-mail não pode derrubar o webhook
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
        // conta pode ter sido removida — sem problema, só não manda
      }
    }
    if (!email) return;

    const shortId = orderId.slice(-8).toUpperCase();
    const orderUrl = `https://mikma.com.br/pedidos/${orderId}`;

    const COPY: Record<typeof uberStatus, { subject: string; headline: string; body: string; button: string }> = {
      pickup_complete: {
        subject: `Seu pedido #${shortId} saiu para entrega`,
        headline: 'A caminho',
        body: `O motoboy já pegou seu pedido na loja e está indo até você. Acompanhe em tempo real no mapa.`,
        button: 'Acompanhar entrega',
      },
      delivered: {
        subject: `Pedido #${shortId} entregue ✅`,
        headline: 'Entregue',
        body: `Seu pedido acabou de ser entregue. Esperamos que você aproveite! Se tiver qualquer problema, é só responder o e-mail de confirmação da compra.`,
        button: 'Ver pedido',
      },
      canceled: {
        subject: `Atualização sobre seu pedido #${shortId}`,
        headline: 'Aviso',
        body: `Houve um imprevisto com o motoboy da sua entrega. Já estamos providenciando um novo despacho — nenhuma ação é necessária da sua parte.`,
        button: 'Ver pedido',
      },
      returned: {
        subject: `Atualização sobre seu pedido #${shortId}`,
        headline: 'Aviso',
        body: `Seu pedido não pôde ser entregue e voltou para a loja. Vamos entrar em contato para reagendar — nenhuma ação é necessária da sua parte agora.`,
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
    });
  } catch (err) {
    console.error('[notifyCustomerDeliveryStatus] falha ao enviar e-mail (best-effort, ignorado):', err);
  }
}
