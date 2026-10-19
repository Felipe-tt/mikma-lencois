/**
 * Helpers da fila de visitantes do modo manutenção (coleção maintenance_queue).
 *
 * Roda tanto na borda (src/proxy.ts, Edge Runtime) quanto em rotas Node, por
 * isso usa só Web Crypto e nada específico de Node.
 *
 * Por que o ID é um HMAC do IP e não o IP "com underline":
 * - A regra do Firestore deixa o proxy (sem login) LER um documento pelo ID.
 *   Com o IP como ID, qualquer pessoa podia consultar "o IP x.x.x.x entrou na
 *   fila?" e, junto com a leitura aberta da coleção, listar todos os visitantes.
 * - Agora `list` é só para a equipe e o ID não é derivável sem o segredo.
 */

const FALLBACK_SALT = 'mikma-maintenance-queue-v1';
const encoder = new TextEncoder();

/** ID (64 hex) do documento da fila para um IP. Estável para o mesmo IP+segredo. */
export async function maintenanceDocId(ip: string, secret?: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret || FALLBACK_SALT),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`maintenance-queue:${ip}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Só o caminho, sem query string nem hash. Links de e-mail carregam token
 * (/redefinir-senha?email=...&token=...); isso NUNCA pode ir parar num log
 * ou numa coleção, mesmo que só a equipe leia.
 */
export function pathOnly(pathname: string): string {
  return pathname.split('?')[0].split('#')[0].slice(0, 200);
}

/** Referer reduzido a origem + caminho (sem query/hash) e limitado em tamanho. */
export function safeReferer(referer: string | null | undefined): string {
  if (!referer) return '';
  try {
    const u = new URL(referer);
    return `${u.origin}${u.pathname}`.slice(0, 300);
  } catch {
    return '';
  }
}

/** Limita o tamanho de um texto vindo de header (a regra do Firestore também limita). */
export function clip(value: string | null | undefined, max: number): string {
  return (value ?? '').slice(0, max);
}

// Bots/crawlers que não devem poluir a fila de manutenção, não são
// visitantes reais esperando acesso, e não faz sentido o admin ficar
// vendo "GoogleBot entrou na fila".
export const BOT_UA_PATTERN = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|semrush|ahrefs|mj12bot|dotbot|petalbot|yandex|baidu|duckduckbot|nutch|scrapy|python-requests|curl\/|wget\/|headless|phantomjs|okhttp|libwww-perl|go-http-client/i;

export function isBotUserAgent(ua: string): boolean {
  return BOT_UA_PATTERN.test(ua);
}
