import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'
import { getAuth, Auth } from 'firebase-admin/auth'
import { getMessaging, Messaging } from 'firebase-admin/messaging'

// Evita MaxListenersExceededWarning do Firebase Admin em SSR
if (typeof process !== 'undefined' && process.setMaxListeners) {
  process.setMaxListeners(25);
}

// Normaliza a chave privada da service account vinda de env var.
//
// O erro "DECODER routines::unsupported" ao assinar (visto em produção,
// só na rota que usa o bucket de assinatura dedicado abaixo) indica que
// o OpenSSL do Node não conseguiu interpretar a string como um PEM
// válido. Duas causas comuns, cobertas aqui:
//   1) A env var às vezes chega com aspas literais em volta (comum quando
//      a chave inteira é colada como valor de variável de ambiente em
//      algum painel/pipeline de deploy) — sem remover, elas viram parte
//      do "corpo" do PEM e quebram a leitura.
//   2) \n escapado (2 caracteres: barra + "n") precisa virar quebra de
//      linha de verdade.
function normalizePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n').trim();
}

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    }),
    // Sem isso, adminStorage.bucket() (sign-upload, delete de imagem, etc.)
    // não sabe em qual bucket operar e lança "Bucket name not specified or
    // invalid" — é o que causava o 500 no upload de imagem do rascunho.
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  })
}

// Lazy getters — só inicializa quando chamado em runtime, não no build
let _db: Firestore | null = null
let _auth: Auth | null = null
let _messaging: Messaging | null = null

export function getAdminDb(): Firestore {
  if (!_db) _db = getFirestore(getAdminApp())
  return _db
}

export function getAdminAuth(): Auth {
  if (!_auth) _auth = getAuth(getAdminApp())
  return _auth
}

// getMessaging() sem argumento depende do app default já estar
// inicializado antes de ser chamado — como a inicialização aqui é lazy,
// passar getAdminApp() explicitamente evita o erro
// "The default Firebase app does not exist" quando esta é a primeira
// coisa a tocar o firebase-admin numa invocação (ex: rota que só usa
// notifySeller e nunca toca adminDb/adminAuth antes).
export function getAdminMessaging(): Messaging {
  if (!_messaging) {
    _messaging = getMessaging(getAdminApp());
  }
  return _messaging
}

// Storage admin
import { getStorage as getAdminStorage } from 'firebase-admin/storage';

export const adminStorage = {
  bucket: () => getAdminStorage(getAdminApp()).bucket(),
};

// Credenciais da service account já normalizadas, pra quem precisa assinar
// URLs "na mão" (ver src/lib/gcsSignedUrl.ts) em vez de usar
// @google-cloud/storage's getSignedUrl() — que em produção estourava
// SigningError "DECODER routines::unsupported" ao tentar assinar (bug/
// incompatibilidade da versão de google-auth-library empacotada ali,
// não da chave em si — a mesma chave assina normalmente via crypto puro).
export function getServiceAccountCredentials() {
  return {
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? '',
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY) ?? '',
    bucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  };
}

// Aliases para compatibilidade com código existente
export const adminDb = new Proxy({} as Firestore, {
  get(_, prop) {
    return (getAdminDb() as any)[prop]
  },
})

export const adminAuth = new Proxy({} as Auth, {
  get(_, prop) {
    return (getAdminAuth() as any)[prop]
  },
})
