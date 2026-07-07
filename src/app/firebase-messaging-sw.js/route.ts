// Serve o service worker do Firebase Cloud Messaging em /firebase-messaging-sw.js
// (precisa estar na raiz do domínio para o escopo de push cobrir o site todo).
// Servido via rota dinâmica (não public/) porque precisamos injetar a config
// do Firebase, que só existe em process.env em runtime/build.
export const dynamic = 'force-dynamic';

function getConfig() {
  const raw = process.env.__FIREBASE_DEFAULTS__;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.config?.apiKey) return parsed.config;
    } catch {
      // ignore e cai para as env vars de build
    }
  }
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  };
}

export async function GET() {
  const config = getConfig();

  const body = `
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(config)});

const messaging = firebase.messaging();

// Notificação recebida com o navegador em background/fechado (Android).
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Nova atividade';
  const body = (payload.notification && payload.notification.body) || '';
  const url = (payload.data && payload.data.url) || '/painel/pedidos';

  self.registration.showNotification(title, {
    body,
    icon: '/favicon-96.png',
    badge: '/favicon-96.png',
    data: { url },
  });
});

// Clique na notificação abre (ou foca) o painel na aba certa.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/painel/pedidos';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
`.trim();

  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    },
  });
}
