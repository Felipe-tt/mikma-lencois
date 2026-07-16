/**
 * Aplica CORS no bucket do Firebase Storage, permitindo que o navegador
 * faça o PUT direto de upload assinado (signed URL) para o bucket a
 * partir do domínio do site.
 *
 * Sem isso, o upload assinado (URL correta, assinatura correta) ainda
 * falha no navegador com "Failed to fetch" — porque o Storage nunca foi
 * autorizado a responder com os headers de CORS pra origem do site, e o
 * navegador bloqueia a resposta do preflight/PUT antes mesmo dela chegar
 * no código.
 *
 * Uso (CI): node scripts/set-bucket-cors.mjs /caminho/para/service-account.json
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const keyPath = process.argv[2];
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

if (!keyPath) {
  console.error('[set-bucket-cors] Uso: node scripts/set-bucket-cors.mjs <caminho-service-account.json>');
  process.exit(1);
}
if (!bucketName) {
  console.error('[set-bucket-cors] Faltou a env NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount), storageBucket: bucketName });
}

const bucket = getStorage().bucket();

// Origens que precisam poder fazer upload direto pro bucket.
const allowedOrigins = [
  'https://mikma.com.br',
  'https://www.mikma.com.br',
  // domínio de preview do Firebase Hosting, útil pra testar antes do deploy
  // de produção (ex: mikma-lencois--pr123.web.app). Curinga de subdomínio
  // não é suportado pelo GCS CORS, então liberamos o domínio "raiz" do
  // hosting também:
  'https://mikma-lencois.web.app',
  'https://mikma-lencois.firebaseapp.com',
];

await bucket.setCorsConfiguration([
  {
    origin: allowedOrigins,
    method: ['PUT', 'GET', 'HEAD'],
    // Headers que o navegador precisa poder LER na resposta do PUT/preflight.
    responseHeader: [
      'Content-Type',
      'x-goog-meta-cache-control',
      'x-goog-meta-firebasestoragedownloadtokens',
    ],
    maxAgeSeconds: 3600,
  },
]);

console.log(`[set-bucket-cors] CORS aplicado com sucesso ao bucket "${bucketName}" para as origens:`, allowedOrigins);
