// Sentry pro runtime Node.js (rotas de API, server components, cron jobs).
// Sem efeito nenhum se SENTRY_DSN não estiver configurada, é assim de
// propósito, pra rodar sem quebrar em ambientes de preview/dev que não
// têm a env var.
import * as Sentry from '@sentry/nextjs';
import { SENTRY_DATA_COLLECTION } from './src/lib/sentryPrivacy';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Sem tracesSampleRate: só erros (rastreamento cortado no build, ver
  // compiler.define no next.config).
  // Nada de dados pessoais nem conteúdo de request/response (ver sentryPrivacy.ts).
  dataCollection: SENTRY_DATA_COLLECTION,
});
