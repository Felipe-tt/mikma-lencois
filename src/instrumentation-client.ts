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
  // Sem session replay — não faz sentido pra esse porte de loja e evita
  // capturar sem querer algo sensível digitado em algum formulário.
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
