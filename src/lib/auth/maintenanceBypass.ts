// Compatível com Node e Edge Runtime — usa só Web Crypto (crypto.subtle),
// nada de 'crypto' do Node, porque o middleware roda em Edge e precisa
// verificar esse cookie sem ter acesso ao firebase-admin.

export const MAINTENANCE_BYPASS_COOKIE = 'mikma_admin_bypass';
const BYPASS_TTL_MS = 6 * 60 * 60 * 1000; // 6h — renovado a cada login/refresh de token

// Buffer não está disponível no Edge Runtime por padrão — conversão manual
// de ArrayBuffer para base64url usando só APIs Web padrão.
function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toBase64Url(sig);
}

/** Gera o valor do cookie: uid.expiresAt.assinatura */
export async function signBypassCookie(uid: string, secret: string): Promise<string> {
  const expiresAt = Date.now() + BYPASS_TTL_MS;
  const payload = `${uid}.${expiresAt}`;
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

/**
 * Verifica o cookie: assinatura bate e ainda não expirou.
 * Não precisa decodificar o uid pra nada além de log — o middleware só
 * precisa saber "esse cookie foi emitido legitimamente e ainda vale".
 */
export async function verifyBypassCookie(cookieValue: string, secret: string): Promise<boolean> {
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return false;
  const [uid, expiresAtStr, sig] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!uid || !expiresAt || Number.isNaN(expiresAt) || Date.now() > expiresAt) return false;

  const expectedSig = await hmac(secret, `${uid}.${expiresAtStr}`);
  // Comparação simples — não é timing-safe, mas o risco aqui é baixíssimo
  // (o pior caso de um ataque de timing bem-sucedido é só pular a tela de
  // manutenção, não um dado sensível).
  return sig === expectedSig;
}
