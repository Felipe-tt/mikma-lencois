// Inline script injetado no <head> antes do hydrate para evitar flash
// Lê localStorage; se não houver preferência salva, usa 'light' como default
export function ThemeScript() {
  const script = `
(function() {
  try {
    var saved = localStorage.getItem('mikma-theme');
    // Default sempre light — ignora prefers-color-scheme do SO
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();
`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
