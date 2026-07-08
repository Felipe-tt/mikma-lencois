// Sentry pro runtime Node.js (rotas de API, server components, cron jobs).
// Sem efeito nenhum se SENTRY_DSN não estiver configurada — é assim de
// propósito, pra rodar sem quebrar em ambientes de preview/dev que não
// têm a env var.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // Nunca manda o conteúdo de request/response (pode conter dados de
  // pagamento, endereço, etc) — só stack trace e contexto do erro.
  sendDefaultPii: false,
});
