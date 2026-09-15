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
  /**
   * Quando informado, em vez de criar um documento novo a cada chamada,
   * atualiza o mesmo documento (id = dedupeKey) e incrementa `count`.
   * Sem isso, um alerta recorrente (estoque baixo do mesmo SKU, por
   * exemplo, avisado 1x/dia até alguém repor) empilha um item novo por
   * dia pra sempre, poluindo a lista com dezenas de linhas idênticas ao
   * longo de semanas — o problema real não é "notificou de novo", é
   * "cada aviso vira uma linha nova esquecida na lista".
   */
  dedupeKey?: string;
}

/**
 * Grava uma notificação em notifications/seller/items, lida pelo sino no
 * painel (tempo real via onSnapshot). Separado do push (notifySeller) de
 * propósito: o sino é o histórico persistente, dá pra ver de novo depois,
 * mesmo se perdeu o push (app fechado, notificação dispensada sem ler,
 * dispositivo sem permissão concedida, etc).
 *
 * Best-effort: nunca lança. Uma falha aqui não pode derrubar o fluxo que
 * chamou (pagamento, webhook do Uber, etc).
 */
export async function notifyInApp({ type, message, orderId, url, dedupeKey }: InAppNotificationInput): Promise<void> {
  try {
    const itemsRef = adminDb.collection('notifications').doc('seller').collection('items');
    if (dedupeKey) {
      // set + merge no mesmo id: primeira vez cria, das próximas só
      // atualiza a mensagem/timestamp e soma no contador — a linha sobe
      // pro topo (createdAt novo) em vez de duplicar.
      await itemsRef.doc(dedupeKey).set({
        type,
        message,
        ...(orderId ? { orderId } : {}),
        ...(url ? { url } : {}),
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        count: FieldValue.increment(1),
      }, { merge: true });
      return;
    }
    await itemsRef.add({
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
