export const dynamic = 'force-dynamic';

// ⚠️ ROTA TEMPORÁRIA — só pra verificar a integração do Sentry.
// Remover depois de confirmar que o erro apareceu em https://mikma.sentry.io/issues/
export async function GET() {
  throw new Error('[sentry-test] Erro de teste proposital — se você está vendo isso no Sentry, a integração funciona.');
}
