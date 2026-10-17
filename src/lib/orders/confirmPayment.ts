import * as Sentry from '@sentry/nextjs';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';
import { notifySeller } from '@/lib/push/notifySeller';
import { summarizeOrderItems } from '@/lib/push/summarizeOrderItems';
import { expandStockLines } from '@/lib/orderStockLines';
import { recordShippingCollected } from '@/lib/shipping-ledger';
import { buildConfirmed } from '@/lib/email/orderStatusEmails';
import { CONTACT_EMAIL } from '@/lib/email/layout';
import type { Order } from '@/types';

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Confirma um pedido como pago: status -> 'paid', debita estoque real,
 * libera a reserva, limpa o carrinho, notifica o vendedor e envia o e-mail
 * de confirmação pro cliente.
 *
 * Usado tanto pelo webhook real da AbacatePay (pagamento pela plataforma)
 * quanto pela confirmação manual no painel (pagamento por fora: dinheiro,
 * transferência direta, outra plataforma). Mesmo caminho de código para os
 * dois — assim um pedido confirmado manualmente passa exatamente pelos
 * mesmos efeitos colaterais de um pago pela AbacatePay, sem duplicar lógica
 * e sem risco de esquecer de debitar estoque ou notificar em um dos dois.
 *
 * `manual`, quando presente, marca o pedido com quem confirmou e por quê,
 * pra auditoria (nunca deve ser possível confundir com um pagamento real
 * passado pela AbacatePay).
 *
 * Retorna `true` se o pedido foi de fato confirmado agora (idempotente:
 * `false` se não existe ou já não estava mais 'pending_payment' — webhooks
 * duplicados/atrasados e cliques duplicados no botão manual caem aqui sem
 * duplicar nenhum efeito). Lança se a transação falhar, pra quem chamou
 * poder pedir um novo envio (webhook) ou mostrar o erro (painel).
 */
export async function confirmOrderPaid(
  orderId: string,
  txId: string,
  note: string,
  manual?: { uid: string; note: string }
): Promise<boolean> {
  const orderRef = adminDb.collection('orders').doc(orderId);
  const now = new Date().toISOString();

  let order: FirebaseFirestore.DocumentData | null;
  try {
    order = await adminDb.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) return null;
      const data = orderSnap.data()!;
      // Confirmação MANUAL também aceita PIX expirado: o cliente pode ter
      // pagado por fora (transferência, dinheiro) depois que o PIX venceu.
      // Nesse caso a reserva já foi liberada na expiração, então só debita
      // a quantidade (sem mexer em reserved). O webhook continua exigindo
      // pending_payment.
      const wasExpired = data.status === 'payment_expired';
      if (data.status !== 'pending_payment' && !(manual && wasExpired)) return null;

      // Defesa em profundidade: o evento é assinado, mas se o txId diferir do
      // registrado no pedido (ex.: cliente pagou um QR antigo depois de gerar
      // outro) NÃO rejeitamos, para não deixar dinheiro recebido com pedido
      // parado. Só deixamos o alerta visível no histórico para conferência.
      const registeredTxId = (data.payment as { txId?: string } | undefined)?.txId;
      const txMismatch = !!registeredTxId && registeredTxId !== txId;
      const auditNote = txMismatch
        ? `${note} · ATENÇÃO: txId do evento difere do registrado (${registeredTxId.slice(-8)})`
        : note;

      // Leituras antes das escritas (exigência da transação). SKU sem
      // documento de estoque (produto/variação apagado depois do pedido)
      // é pulado: tx.update num doc inexistente derrubava a transação
      // inteira e o pedido pago ficava parado em pending_payment.
      const lines = expandStockLines(data.items as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>);
      const invRefs = lines.map(line => adminDb.collection('inventory').doc(line.sku));
      const invSnaps = invRefs.length > 0 ? await tx.getAll(...invRefs) : [];

      tx.update(orderRef, {
        status: 'paid',
        'payment.paidAt': FieldValue.serverTimestamp(),
        'payment.txId': txId,
        ...(txMismatch ? { 'payment.txIdMismatch': true, 'payment.previousTxId': registeredTxId } : {}),
        ...(manual ? {
          'payment.confirmedManuallyBy': manual.uid,
          'payment.confirmedManuallyNote': manual.note,
        } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({ status: 'paid', at: now, note: auditNote }),
      });

      // Decrementa quantity (estoque real, debitado de fato) e reserved
      // (libera a reserva feita em create-checkout/create-pix na criação
      // do pedido), ambos pelo mesmo motivo: a venda se concretizou.
      // expandStockLines inclui a fronha trocada (Jogo de Cama) junto.
      lines.forEach((line, i) => {
        if (!invSnaps[i].exists) {
          Sentry.captureMessage('confirm-order-paid: SKU sem documento de estoque', {
            level: 'warning', extra: { orderId, sku: line.sku },
          });
          return;
        }
        tx.update(invRefs[i], {
          quantity: FieldValue.increment(-line.quantity),
          ...(wasExpired ? {} : { reserved: FieldValue.increment(-line.quantity) }),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      return data;
    });
  } catch (err) {
    console.error(`Failed to confirm order ${orderId}:`, err);
    Sentry.captureException(err, { tags: { route: 'confirm-order-paid' }, extra: { orderId, manual: !!manual } });
    // Relança: o webhook precisa responder erro pro gateway reenviar o
    // evento. Engolir aqui deixava o pedido pago parado e o cron
    // cancelava depois de 48h.
    throw err;
  }

  if (!order) {
    console.log('Order not found or already processed:', orderId);
    return false;
  }

  // ── Caixa de frete: registra o que foi de fato cobrado do cliente ─────
  // Best-effort, nunca deve travar a confirmação do pedido.
  try {
    const shippingCollected = (order.shippingCents as number) ?? 0;
    if (shippingCollected > 0) await recordShippingCollected(shippingCollected);
  } catch (err) {
    console.warn(`[shipping-ledger] falha ao registrar coleta do pedido ${orderId}:`, err);
  }

  // ── Limpa o carrinho do cliente + notifica vendedor ───────────────────
  // Fora da transação (best-effort, não precisa ser atômico com o
  // pagamento em si). O pedido JÁ foi confirmado como pago acima —
  // uma falha aqui (rede instável, etc.) não pode fazer a função inteira
  // lançar e o chamador (mark-paid-manually, simulate-payment) devolver
  // um 500 pro vendedor como se o pagamento não tivesse sido confirmado.
  try {
    const batch = adminDb.batch();
    const cartRef = adminDb.collection('carts').doc(order.userId as string);
    batch.update(cartRef, { items: [], updatedAt: FieldValue.serverTimestamp() });

    const notifRef = adminDb
      .collection('notifications')
      .doc('seller')
      .collection('items')
      .doc();
    batch.set(notifRef, {
      type: 'new_order',
      orderId,
      message: manual
        ? `Pedido marcado como pago manualmente: #${orderId.slice(-8).toUpperCase()}`
        : `Novo pedido pago: #${orderId.slice(-8).toUpperCase()}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    console.warn(`[confirm-order-paid] falha ao limpar carrinho/notificar (best-effort), pedido ${orderId} já confirmado:`, err);
  }
  console.log(`Order ${orderId} confirmed, ${note}`);

  // Push pro vendedor (best-effort, nunca deve afetar a confirmação do pedido)
  const payMethodLabel = (order.payment as { method: string }).method === 'pix' ? 'PIX' : 'Cartão';
  await notifySeller({
    title: manual ? 'Pagamento confirmado manualmente' : 'Pagamento confirmado 🎉',
    body: `${summarizeOrderItems((order.items ?? []) as { productName: string; quantity: number }[])} · ${formatCurrency(order.totalCents as number)} · ${manual ? 'manual' : payMethodLabel}`,
    url: `/painel/pedidos/${orderId}`,
    data: { orderId, event: 'payment_confirmed' },
  });

  // ── Email de confirmação ao cliente ───────────────────────────────────
  // Fora do batch (best-effort, falha de email não reverte o pedido)
  try {
    const userSnap = await adminDb.collection('users').doc(order.userId as string).get();
    const userData = userSnap.data() ?? {};
    const customerName = (userData.name ?? userData.displayName ?? 'Cliente') as string;

    let customerEmail = userData.email as string | undefined;
    if (!customerEmail) {
      try {
        const authUser = await adminAuth.getUser(order.userId as string);
        customerEmail = authUser.email;
      } catch {
        console.warn(`[confirm-order-paid] não foi possível obter email do Auth para uid=${order.userId}`);
      }
    }

    if (customerEmail) {
      // Layout único dos e-mails de pedido; nomes de produto escapados pelo
      // template (antes entravam crus no HTML). replyTo: o e-mail convida a
      // responder, e antes a resposta ia pro noreply e se perdia.
      const payload = buildConfirmed(
        { id: orderId, items: order.items as Order['items'], totalCents: order.totalCents as number, payment: order.payment as { method: string } },
        customerName,
      );
      await sendEmail({
        to: customerEmail,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        from: 'noreply',
        replyTo: CONTACT_EMAIL,
      });

      console.log(`[confirm-order-paid] email de confirmação enviado para ${customerEmail}, pedido ${orderId}`);
    }
  } catch (emailErr) {
    // Falha de email não deve quebrar a confirmação, pedido já foi confirmado
    console.error('[confirm-order-paid] falha ao enviar email de confirmação:', emailErr);
  }

  return true;
}
