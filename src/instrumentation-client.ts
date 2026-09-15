// Sentry no navegador. Usa NEXT_PUBLIC_SENTRY_DSN (precisa do prefixo
// NEXT_PUBLIC_ pra ficar disponível no bundle do client). No-op sem a
// env var configurada.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  // Sem session replay, não faz sentido pra esse porte de loja e evita
  // capturar sem querer algo sensível digitado em algum formulário.

  // "Database is closing/hidden" (@firebase/auth/.../indexed_db.ts): erro
  // conhecido e benigno do próprio SDK do Firebase Auth — a conexão
  // IndexedDB fecha no meio de uma escrita de persistência quando a aba
  // troca de visibilidade/navega rápido, o SDK trata isso internamente e
  // tenta de novo, mas a promise rejeitada ainda escapa como
  // unhandledrejection. Não é um bug do nosso código, não afeta o login
  // (initializeAuth já tem fallback pra browserLocalPersistence/
  // inMemoryPersistence em client.ts) — só ruído não-acionável no Sentry.
  ignoreErrors: [/Database is closing\/hidden/],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
