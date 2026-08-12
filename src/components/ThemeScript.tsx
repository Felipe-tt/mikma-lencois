// Inline script injetado no <head> antes do hydrate para evitar flash
// Lê localStorage; se não houver preferência salva, usa 'light' como default
//
// Conteúdo fixo (sem dados de usuário interpolados) e liberado na CSP via
// hash SHA-256 (script-src 'sha256-...' em src/proxy.ts), não via nonce:
// nonce exigiria ler headers() aqui, o que forçaria renderização dinâmica
// do layout raiz para TODAS as páginas do site, quebrando o ISR.
// IMPORTANTE: qualquer mudança neste texto exige recalcular o hash em
// proxy.ts (ver comentário lá), senão o script para de rodar em produção.
export function ThemeScript() {
  const script = `
(function() {
  try {
    var saved = localStorage.getItem('mikma-theme');
    // Default sempre light, ignora prefers-color-scheme do SO
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();
`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
