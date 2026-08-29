// Depois de um deploy, o servidor troca os arquivos .js/.css por versões
// com hash novo e apaga os antigos. Quem estava com a aba já aberta (ou
// navegou de um cache antigo) tenta buscar um arquivo que não existe mais
// -> 404 -> erro de chunk -> a navegação trava até a pessoa lembrar de
// dar F5 sozinha.
//
// Esse erro pode aparecer de duas formas bem diferentes nesse projeto
// (Next.js App Router + Turbopack):
// 1. Como evento global (`window.error`/`unhandledrejection`) — pego por
//    ChunkErrorReload.tsx, montado uma vez no layout raiz.
// 2. Como erro de renderização que sobe pela árvore do React e é
//    capturado pelo error boundary do App Router — pego em
//    src/app/global-error.tsx.
// Os dois usam esse mesmo detector e o mesmo mecanismo de "só recarrega
// uma vez por aba" (sessionStorage), daí ficar centralizado aqui.
//
// O Turbopack tem sua PRÓPRIA mensagem de erro pra esse mesmo problema —
// nada a ver com o "ChunkLoadError"/"Loading chunk X failed" do Webpack.
// Sem cobrir esse padrão, o mecanismo simplesmente não disparava nesse
// projeto (visto em produção, Sentry JAVASCRIPT-NEXTJS-A: "Module ... was
// instantiated because it was required from module ..., but the module
// factory is not available").

const RELOAD_KEY = 'mikma_chunk_reload_attempt';

export function isChunkError(reason: unknown): boolean {
  const msg = String(
    (reason && typeof reason === 'object' && 'message' in reason ? (reason as { message?: unknown }).message : reason) ?? ''
  );
  return /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|error loading dynamically imported module|module factory is not available|Cannot find module/i.test(msg);
}

export function reloadOnce(): boolean {
  const already = window.sessionStorage.getItem(RELOAD_KEY);
  if (already) return false; // já tentamos nessa sessão de aba, não insiste pra não loopar
  window.sessionStorage.setItem(RELOAD_KEY, '1');
  window.location.reload();
  return true;
}

export function clearReloadAttempt(): void {
  window.sessionStorage.removeItem(RELOAD_KEY);
}
