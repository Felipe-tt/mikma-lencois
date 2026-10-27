// Sentry no navegador, só pra erros. Usa NEXT_PUBLIC_SENTRY_DSN (precisa
// do prefixo NEXT_PUBLIC_ pra ficar disponível no bundle do client).
// No-op sem a env var configurada.
//
// O SDK (~100 KB) não entra mais no carregamento da página: baixa quando o
// navegador fica ocioso. Erros que acontecerem antes disso ficam numa fila
// e são enviados assim que ele inicia.
import { flushErrors, reportError } from '@/lib/errorQueue';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && typeof window !== 'undefined') {
  const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  const start = () => import('@/lib/sentryClient').then(Sentry => {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      sendDefaultPii: false,
      // Sem "sessões" (saúde de release): mandavam um aviso ao Sentry a cada
      // página vista, cada um passando pelo servidor no túnel /monitoring.
      integrations: defaults => defaults.filter(i => i.name !== 'BrowserSession'),
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
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    flushErrors(err => { Sentry.captureException(err); });
  }).catch(() => { /* sem Sentry nessa visita */ });

  if ('requestIdleCallback' in window) requestIdleCallback(() => void start(), { timeout: 4000 });
  else setTimeout(() => void start(), 2000);
}
