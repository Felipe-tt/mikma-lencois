import crypto from 'node:crypto';

/**
 * Gera uma signed URL V4 do Google Cloud Storage "na mão", seguindo o
 * algoritmo oficial (https://cloud.google.com/storage/docs/access-control/signing-urls-manually),
 * usando só o módulo crypto nativo do Node — sem passar pelo
 * @google-cloud/storage / google-auth-library.
 *
 * Por quê: o caminho padrão (bucket.file().getSignedUrl()) delega a
 * assinatura pra uma versão de google-auth-library empacotada dentro do
 * @google-cloud/storage que, em produção (Node 20 + OpenSSL 3, Cloud Run),
 * vinha estourando "SigningError: error:1E08010C:DECODER
 * routines::unsupported" na hora de assinar.
 *
 * Causa raiz real (achada depois): o firebase-admin valida a mesma chave
 * com `crypto.createPrivateKey()` na inicialização (e não falha -- prova
 * que a chave em si é válida, senão o app inteiro travaria no boot). O bug
 * estava em passar a *string PEM crua* direto pro `.sign()`: no Node com
 * OpenSSL 3, `sign.sign(pemString)` usa um caminho de auto-detecção de
 * formato mais frágil que pode falhar com esse exato erro, enquanto
 * `sign.sign(keyObject)` -- com o KeyObject já construído via
 * `crypto.createPrivateKey()` -- é o caminho robusto (é o que o
 * firebase-admin efetivamente valida/usa por baixo). Por isso conserta a
 * chave é convertê-la pra KeyObject uma vez, aqui embaixo, em vez de
 * assinar a string diretamente.
 */
export function generateV4SignedUploadUrl(opts: {
  bucket: string;
  objectPath: string; // ex: "products/2026/07/draft_123.webp"
  clientEmail: string;
  privateKey: string; // PEM já normalizado (quebras de linha reais)
  contentType: string;
  expiresInSeconds?: number; // máx 604800 (7 dias)
  extensionHeaders?: Record<string, string>; // ex: x-goog-meta-*
}): string {
  const {
    bucket,
    objectPath,
    clientEmail,
    privateKey,
    contentType,
    expiresInSeconds = 900,
    extensionHeaders = {},
  } = opts;

  // Constrói o KeyObject uma vez, com uma mensagem de erro clara (sem
  // vazar a chave) se a string realmente não for um PEM válido -- isso não
  // deveria acontecer (mesma chave que o firebase-admin já validou), mas
  // se acontecer é melhor um erro explícito do que o DECODER genérico.
  let keyObject: crypto.KeyObject;
  try {
    keyObject = crypto.createPrivateKey(privateKey);
  } catch (err) {
    throw new Error(
      `[gcsSignedUrl] Não foi possível interpretar a private key como PEM válido (tamanho: ${privateKey.length}, ` +
      `começa com "-----BEGIN"? ${privateKey.trimStart().startsWith('-----BEGIN')}, ` +
      `termina com "-----END..."? ${privateKey.trimEnd().endsWith('-----')}). Causa original: ${(err as Error).message}`
    );
  }

  const host = `${bucket}.storage.googleapis.com`;
  const canonicalUri = '/' + objectPath.split('/').map(encodeURIComponent).join('/');

  const now = new Date();
  const requestTimestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const datestamp = requestTimestamp.slice(0, 8); // YYYYMMDD
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${clientEmail}/${credentialScope}`;

  // Cabeçalhos que farão parte da assinatura — precisam ser enviados
  // exatamente assim no PUT de upload que vai usar essa URL.
  const headers: Record<string, string> = {
    host,
    'content-type': contentType,
    ...Object.fromEntries(Object.entries(extensionHeaders).map(([k, v]) => [k.toLowerCase(), v])),
  };
  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${String(headers[k]).trim()}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const queryParams: Record<string, string> = {
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': requestTimestamp,
    'X-Goog-Expires': String(expiresInSeconds),
    'X-Goog-SignedHeaders': signedHeaders,
  };
  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex');

  const stringToSign = [
    'GOOG4-RSA-SHA256',
    requestTimestamp,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  const signature = crypto.createSign('RSA-SHA256').update(stringToSign, 'utf8').sign(keyObject, 'hex');

  return `https://${host}${canonicalUri}?${canonicalQueryString}&x-goog-signature=${signature}`;
}
