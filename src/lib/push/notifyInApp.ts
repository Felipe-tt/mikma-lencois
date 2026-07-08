import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export type InAppNotificationType =
  | 'payment_initiated'
  | 'new_order'
  | 'uber_pickup'
  | 'uber_delivered'
  | 'uber_problem'
  | 'low_stock';

interface InAppNotificationInput {
  type: InAppNotificationType;
  message: string;
  orderId?: string;
  url?: string;
}

/**
 * Grava uma notificação em notifications/seller/items, lida pelo sino no
 * painel (tempo real via onSnapshot). Separado do push (notifySeller) de
 * propósito: o sino é o histórico persistente — dá pra ver de novo depois,
 * mesmo se perdeu o push (app fechado, notificação dispensada sem ler,
 * dispositivo sem permissão concedida, etc).
 *
 * Best-effort: nunca lança. Uma falha aqui não pode derrubar o fluxo que
 * chamou (pagamento, webhook do Uber, etc).
 */
export async function notifyInApp({ type, message, orderId, url }: InAppNotificationInput): Promise<void> {
  try {
    await adminDb
      .collection('notifications')
      .doc('seller')
      .collection('items')
      .add({
        type,
        message,
        ...(orderId ? { orderId } : {}),
        ...(url ? { url } : {}),
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error('[notifyInApp] falha ao gravar notificação (best-effort, ignorado):', err);
  }
}
