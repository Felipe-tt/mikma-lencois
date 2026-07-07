import { getMessaging } from 'firebase-admin/messaging';
import { adminDb } from '@/lib/firebase/admin';

interface SellerPushPayload {
  title: string;
  body: string;
  /** Rota relativa pra abrir ao clicar na notificação, ex: /painel/pedidos/ord_123 */
  url?: string;
  /** Dados extras (ex: orderId) — chegam em event.notification.data no SW */
  data?: Record<string, string>;
}

/**
 * Envia push para TODOS os dispositivos de seller/admin cadastrados.
 * Nunca envia para compradores — os tokens em `pushTokens` só existem
 * porque o endpoint /api/painel/push-token exige role seller/admin.
 *
 * Best-effort: falha de push nunca deve quebrar o fluxo de pagamento/pedido
 * que chamou esta função — por isso todos os erros são apenas logados.
 */
export async function notifySeller(payload: SellerPushPayload): Promise<void> {
  try {
    const tokensSnap = await adminDb.collection('pushTokens').get();
    if (tokensSnap.empty) {
      console.log('[notifySeller] nenhum token cadastrado, pulando envio');
      return;
    }

    const tokens = tokensSnap.docs.map((d) => d.id);
    console.log(`[notifySeller] enviando para ${tokens.length} token(s) — título: "${payload.title}"`);
    const messaging = getMessaging();

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        ...(payload.url ? { url: payload.url } : {}),
        ...(payload.data ?? {}),
      },
      webpush: {
        notification: {
          icon: '/favicon-96.png',
          badge: '/favicon-96.png',
        },
        fcmOptions: payload.url ? { link: payload.url } : undefined,
      },
    });

    // Remove tokens mortos (app desinstalado, permissão revogada, etc.)
    // para não acumular lixo e não desperdiçar chamadas no futuro.
    const deadTokens: string[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code ?? '';
        console.error(`[notifySeller] falha no token ${tokens[i].slice(0, 12)}...: ${code} — ${r.error?.message ?? ''}`);
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          deadTokens.push(tokens[i]);
        }
      }
    });

    console.log(`[notifySeller] resultado: ${response.successCount} sucesso(s), ${response.failureCount} falha(s)`);

    if (deadTokens.length > 0) {
      const batch = adminDb.batch();
      for (const t of deadTokens) {
        batch.delete(adminDb.collection('pushTokens').doc(t));
      }
      await batch.commit();
    }
  } catch (err) {
    console.error('[notifySeller] falha ao enviar push:', err);
  }
}
