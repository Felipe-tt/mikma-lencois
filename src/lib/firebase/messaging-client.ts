'use client';

import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import app from '@/lib/firebase/client';

export type PushEnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'permission_denied' | 'no_token' | 'error'; detail?: unknown };

/**
 * Pede permissão de notificação e registra o token FCM do vendor no backend.
 * Idempotente: pode ser chamado toda vez que o painel carrega, sem duplicar
 * nada (o backend faz upsert por token).
 */
export async function enablePush(getIdToken: () => Promise<string>): Promise<PushEnableResult> {
  try {
    if (!(await isSupported())) return { ok: false, reason: 'unsupported' };
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return { ok: false, reason: 'unsupported' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'permission_denied' };

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

    const messaging = getMessaging(app);

    // Força descartar qualquer subscription antiga em cache antes de pedir
    // uma nova — sem isso, o SDK pode reaproveitar uma subscription criada
    // com uma VAPID key antiga/incompatível, gerando um token que o
    // navegador acha válido mas o FCM já considera morto (NotRegistered).
    await deleteToken(messaging).catch(() => {});

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) return { ok: false, reason: 'no_token' };

    const idToken = await getIdToken();
    const res = await fetch('/api/painel/push-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) return { ok: false, reason: 'error', detail: await res.text().catch(() => '') };

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'error', detail: err };
  }
}

/** Verifica se o vendor já concedeu permissão de notificação neste navegador. */
export function getPushPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Desativa push neste navegador — remove o token local e no backend. */
export async function disablePush(getIdToken: () => Promise<string>): Promise<void> {
  try {
    if (!(await isSupported())) return;
    const messaging = getMessaging(app);
    const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration ?? undefined,
    }).catch(() => null);

    if (token) {
      const idToken = await getIdToken();
      await fetch('/api/painel/push-token', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token }),
      }).catch(() => {});
      await deleteToken(messaging).catch(() => {});
    }
  } catch {
    // best-effort
  }
}
