import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'
import { getAuth, Auth } from 'firebase-admin/auth'
import { getMessaging, Messaging } from 'firebase-admin/messaging'

// Evita MaxListenersExceededWarning do Firebase Admin em SSR
if (typeof process !== 'undefined' && process.setMaxListeners) {
  process.setMaxListeners(25);
}

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
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
