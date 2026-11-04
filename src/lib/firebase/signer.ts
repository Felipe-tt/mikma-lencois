import crypto from 'node:crypto';

/**
 * Assinatura RSA-SHA256 com a conta de serviço do servidor.
 *
 * Em produção não há chave fixa: o servidor (Cloud Run do App Hosting)
 * pega um token de curta duração no servidor de metadados do Google e pede
 * a assinatura à API IAM Credentials (signBlob). A chave privada fica só
 * com o Google e nunca passa por aqui.
 *
 * Com FIREBASE_PRIVATE_KEY no ambiente (uso local e e2e), assina com ela.
 */

const METADATA = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default';

let cachedEmail: string | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

/** Chave do ambiente, normalizada (aspas em volta e \n escapado). */
export function envPrivateKey(): string | undefined {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return undefined;
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n').trim();
}

async function metadata(path: string): Promise<string> {
  const res = await fetch(`${METADATA}/${path}`, {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`[signer] metadados ${path}: HTTP ${res.status}`);
  return res.text();
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const body = JSON.parse(await metadata('token')) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

/** E-mail da conta de serviço que assina. */
export async function signerEmail(opts: { forceIam?: boolean } = {}): Promise<string> {
  if (!opts.forceIam && envPrivateKey()) return process.env.FIREBASE_CLIENT_EMAIL ?? '';
  cachedEmail ??= (await metadata('email')).trim();
  return cachedEmail;
}

/**
 * Assina `data` (UTF-8) e devolve a assinatura em hex. `forceIam` usa a
 * API IAM mesmo com chave no ambiente (o /api/cron/health testa assim).
 */
export async function signRsaSha256Hex(data: string, opts: { forceIam?: boolean } = {}): Promise<string> {
  const key = opts.forceIam ? undefined : envPrivateKey();
  if (key) {
    return crypto.createSign('RSA-SHA256').update(data, 'utf8').sign(crypto.createPrivateKey(key), 'hex');
  }
  const email = await signerEmail(opts);
  const res = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:signBlob`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: Buffer.from(data, 'utf8').toString('base64') }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!res.ok) throw new Error(`[signer] signBlob: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const { signedBlob } = (await res.json()) as { signedBlob: string };
  return Buffer.from(signedBlob, 'base64').toString('hex');
}
