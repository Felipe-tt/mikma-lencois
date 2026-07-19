/**
 * Cookie de sessão bem enxuto, cuja ÚNICA finalidade é o middleware (Edge
 * Runtime, sem Firebase Admin SDK) saber que quem está navegando é um
 * seller/admin autenticado — usado só pra decidir se pula a tela de
 * manutenção. NÃO é usado como mecanismo de autorização de verdade em
 * nenhuma rota de API: essas continuam exigindo o Bearer token do Firebase
 * + verifyIdToken normalmente, sem mudança nenhuma.
 *
 * Assinado com HMAC-SHA256 via Web Crypto (disponível tanto no Node 20+
 * quanto no Edge Runtime), assim o mesmo código assina (na rota de API,
 * runtime normal) e verifica (no middleware, Edge Runtime) sem precisar
 * de duas implementações.
 */

// IMPORTANTE: o nome precisa ser exatamente "__session". O Firebase Hosting
// descarta TODOS os cookies da requisição antes de encaminhar pro backend,
// exceto um único cookie com esse nome exato — é uma limitação conhecida e
// documentada da própria plataforma (não configurável via firebase.json).
// Usar qualquer outro nome (ex: "staff_session") faz o cookie nunca chegar
// no middleware, mesmo o navegador mandando ele certinho — foi exatamente
// isso que quebrou o bypass antes dessa correção.
export const STAFF_SESSION_COOKIE = '__session';
export const STAFF_SESSION_MAX_AGE_SECONDS = 60 * 60; // 1h — mesma janela do
// ID token do Firebase; o AuthContext no cliente reemite esse cookie a
// cada refresh de token, então na prática ele nunca fica velho enquanto
// a pessoa continua logada e usando o site.

export interface StaffSessionPayload {
  uid: string;
  role: 'seller' | 'admin';
  exp: number; // epoch seconds
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signStaffSession(payload: StaffSessionPayload, secret: string): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyStaffSession(token: string, secret: string): Promise<StaffSessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  try {
    const key = await getHmacKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(sig) as BufferSource, new TextEncoder().encode(body));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as StaffSessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    if (payload.role !== 'seller' && payload.role !== 'admin') return null;
    if (typeof payload.uid !== 'string' || !payload.uid) return null;
    return payload;
  } catch {
    return null;
  }
}
