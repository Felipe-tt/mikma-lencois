/**
 * Extrai o codigo de um erro do Firebase Admin Auth (ex: "auth/user-not-found").
 *
 * O formato mudou entre versoes do firebase-admin: nas antigas o codigo ficava
 * em `errorInfo.code`; na 14.x vem em `code` e `errorInfo` e undefined. Ler so
 * um dos dois fazia a rota tratar "usuario nao existe" como erro interno.
 */
export function authErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as { code?: unknown; errorInfo?: { code?: unknown } };
  if (typeof e.code === 'string' && e.code.startsWith('auth/')) return e.code;
  if (typeof e.errorInfo?.code === 'string') return e.errorInfo.code;
  return undefined;
}
