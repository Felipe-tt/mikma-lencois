/**
 * Escape de HTML para texto controlado por usuário (nome, produto, código de
 * rastreio...) que vai dentro de HTML de e-mail ou de qualquer string HTML
 * montada à mão. Escapa tanto conteúdo quanto valores de atributo.
 * NÃO use em campos `text:` de e-mail (texto puro).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serializa dados para dentro de <script type="application/ld+json">.
 * JSON.stringify não escapa "</script>", então um texto como
 * `</script><img onerror=...>` fecharia a tag e executaria HTML/JS na página.
 * Escapamos os caracteres que o parser HTML usa para sair do contexto
 * (os separadores U+2028/U+2029 também, por segurança em navegadores antigos).
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Remove de um nome de exibição os caracteres que não fazem sentido em nomes
 * e que servem para injeção (<, >, controle). Usado antes de gravar nomes
 * vindos do token ou de formulários.
 */
export function sanitizeDisplayName(value: unknown, max = 100): string {
  return String(value ?? '')
    .replace(/[<>\u0000-\u001f\u007f\u2028\u2029]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
