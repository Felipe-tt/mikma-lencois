
import crypto from 'node:crypto';
import { signRsaSha256Hex } from '@/lib/firebase/signer';

/**
 * Gera uma signed URL V4 do Google Cloud Storage "na mão", seguindo o
 * algoritmo oficial (https://cloud.google.com/storage/docs/access-control/signing-urls-manually).
 *
 * A assinatura sai de src/lib/firebase/signer.ts: em produção pela API IAM
 * Credentials (sem chave fixa no servidor); localmente com a chave do
 * ambiente. Fazer à mão evita o getSignedUrl() do @google-cloud/storage,
 * que em produção falhava com "DECODER routines::unsupported".
 */
export async function generateV4SignedUploadUrl(opts: {
  bucket: string;
  objectPath: string; // ex: "products/2026/07/draft_123.webp"
  clientEmail: string;
  contentType: string;
  expiresInSeconds?: number; // máx 604800 (7 dias)
  extensionHeaders?: Record<string, string>; // ex: x-goog-meta-*
}): Promise<string> {
  const {
    bucket,
    objectPath,
    clientEmail,
    contentType,
    expiresInSeconds = 900,
    extensionHeaders = {},
  } = opts;

  // Path-style (storage.googleapis.com/BUCKET/objeto), não virtual-hosted
  // (BUCKET.storage.googleapis.com/objeto): buckets do Firebase Storage
  // "novos" usam nomes como "projeto.firebasestorage.app", que JÁ TÊM
  // ponto, colar ".storage.googleapis.com" depois disso gera um host
  // inexistente tipo "projeto.firebasestorage.app.storage.googleapis.com"
  // ("Failed to fetch" no navegador). Path-style funciona pra qualquer
  // nome de bucket, com ou sem ponto.
  const host = 'storage.googleapis.com';
  const canonicalUri = '/' + [bucket, ...objectPath.split('/')].map(encodeURIComponent).join('/');

  const now = new Date();
  const requestTimestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const datestamp = requestTimestamp.slice(0, 8); // YYYYMMDD
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${clientEmail}/${credentialScope}`;

  // Cabeçalhos que farão parte da assinatura, precisam ser enviados
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

  const signature = await signRsaSha256Hex(stringToSign);

  return `https://${host}${canonicalUri}?${canonicalQueryString}&x-goog-signature=${signature}`;
}
