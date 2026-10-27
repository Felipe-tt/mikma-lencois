// Sentry pro runtime Edge (middleware.ts). Mesmas ressalvas do
// sentry.server.config.ts, no-op sem SENTRY_DSN.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Sem tracesSampleRate: só erros (rastreamento cortado no build, ver
  // compiler.define no next.config).
  sendDefaultPii: false,
});
