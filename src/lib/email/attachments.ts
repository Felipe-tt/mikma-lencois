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

/**
 * Caracteres invisíveis e de direção do texto: "fatura\u202Efdp.exe" aparece
 * na tela como "faturaexe.pdf". Quem manda o e-mail escolhe o nome do anexo.
 */
const HIDDEN_CHARS = /[\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

/** Nome do anexo como o painel mostra: sem caractere que disfarça a extensão. */
export function attachmentLabel(filename: unknown): string {
  const name = typeof filename === 'string' ? filename.replace(HIDDEN_CHARS, '').trim() : '';
  return (name || 'anexo').slice(0, 120);
}
