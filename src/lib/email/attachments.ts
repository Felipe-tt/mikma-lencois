/**
 * Anexos dos e-mails que chegam no contato (api/email/inbound). Ficam
 * privados no Storage: o painel pede o endereço na hora, com a sessão da
 * equipe (storage.rules).
 */

/** Imagem que o painel mostra na conversa; o resto o navegador baixa. Sem SVG (pode ter script). */
export function isInlineImage(contentType: string): boolean {
  return /^image\/(png|jpe?g|gif|webp|avif|heic|heif|bmp)$/i.test(contentType.split(';')[0].trim());
}

/** Caminho do anexo no Storage: o novo vem em `path`; o antigo, só na URL pública de antes. */
export function attachmentPath(att: { path?: unknown; url?: unknown }): string | null {
  if (typeof att.path === 'string' && /^email-attachments\/[^/]+\/[^/]+$/.test(att.path)) return att.path;
  const m = typeof att.url === 'string'
    ? att.url.match(/^https:\/\/storage\.googleapis\.com\/[^/]+\/(email-attachments\/[^/?#]+\/[^/?#]+)$/)
    : null;
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}
