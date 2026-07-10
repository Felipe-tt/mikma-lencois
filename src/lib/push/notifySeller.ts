import { adminDb, getAdminMessaging } from '@/lib/firebase/admin';

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

    // Dedupe por uid: mantém só o token mais recente de cada vendor.
    // Isso é uma segunda camada de proteção além do dedupe feito no
    // cadastro (POST /api/painel/push-token) — cobre o caso de tokens
    // "zumbis" que já existiam no banco antes daquele fix e continuam
    // válidos, o que causava notificação em duplicidade pro mesmo vendor.
    const latestByUid = new Map<string, { token: string; updatedAtMs: number }>();
    tokensSnap.docs.forEach((doc) => {
      const data = doc.data();
      const uid = (data.uid as string) ?? doc.id; // fallback: sem uid, trata como único
      const updatedAtMs = (data.updatedAt?.toMillis?.() ?? data.createdAt?.toMillis?.() ?? 0) as number;
      const current = latestByUid.get(uid);
      if (!current || updatedAtMs > current.updatedAtMs) {
        latestByUid.set(uid, { token: doc.id, updatedAtMs });
      }
    });

    const staleTokenIds = tokensSnap.docs
      .map((d) => d.id)
      .filter((id) => ![...latestByUid.values()].some((v) => v.token === id));

    const tokens = [...latestByUid.values()].map((v) => v.token);
    if (staleTokenIds.length > 0) {
      console.log(`[notifySeller] ignorando ${staleTokenIds.length} token(s) zumbi (uid duplicado) e limpando do banco`);
      const batch = adminDb.batch();
      for (const id of staleTokenIds) batch.delete(adminDb.collection('pushTokens').doc(id));
      await batch.commit();
    }

    console.log(`[notifySeller] enviando para ${tokens.length} token(s) — título: "${payload.title}"`);
    const messaging = getAdminMessaging();

    // IMPORTANTE: não usar o campo `notification` (nem `webpush.notification`) aqui.
    // Quando o payload tem `notification`, o navegador exibe a notificação
    // automaticamente via WebPush em background — e o onBackgroundMessage do
    // service worker (firebase-messaging-sw.js/route.ts) TAMBÉM chama
    // showNotification manualmente, resultando em 2 notificações no celular.
    // Enviando só `data`, o service worker vira o único responsável por exibir.
    const response = await messaging.sendEachForMulticast({
      tokens,
      data: {
        title: payload.title,
        body: payload.body,
        ...(payload.url ? { url: payload.url } : {}),
        ...(payload.data ?? {}),
      },
      webpush: {
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
