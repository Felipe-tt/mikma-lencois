import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'
import { getAuth, Auth } from 'firebase-admin/auth'

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
  })
}

// Lazy getters — só inicializa quando chamado em runtime, não no build
let _db: Firestore | null = null
let _auth: Auth | null = null

export function getAdminDb(): Firestore {
  if (!_db) _db = getFirestore(getAdminApp())
  return _db
}

export function getAdminAuth(): Auth {
  if (!_auth) _auth = getAuth(getAdminApp())
  return _auth
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
