import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// __FIREBASE_DEFAULTS__ is injected at runtime by Firebase Hosting / Cloud Run.
// NEXT_PUBLIC_* vars only exist at build time.
// We read the injected defaults so the real apiKey/clientId is always present.
function getConfig() {
  // Runtime: read from __FIREBASE_DEFAULTS__ env var injected by Firebase
  const raw = process.env.__FIREBASE_DEFAULTS__
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.config?.apiKey) return parsed.config
    } catch {}
  }
  // Build time: use NEXT_PUBLIC_* vars (baked in at build)
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'placeholder',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'placeholder.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'placeholder',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'placeholder.appspot.com',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '000000000000',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:000000000000:web:placeholder',
  }
}

const app = getApps().length ? getApp() : initializeApp(getConfig())

export const auth = getAuth(app)

// Cache local persistente (IndexedDB): o app continua funcionando com
// internet ruim/instável na loja — as vendas ficam guardadas no
// aparelho e sincronizam sozinhas assim que a conexão volta, sem o
// vendedor perceber nada nem precisar refazer a venda.
// IndexedDB só existe no navegador, então no servidor (SSR/build) cai
// pro cache em memória, que é o suficiente já que não há usuário ali.
export const db = initializeFirestore(app, {
  localCache:
    typeof window !== 'undefined'
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
})

export const storage = getStorage(app)
export default app
