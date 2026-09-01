import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
} from 'firebase/auth'
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

// Auth: em alguns navegadores mobile (ex.: Chrome Android com a aba em
// segundo plano/oculta durante o load) a conexão IndexedDB é fechada pelo
// navegador no meio da inicialização do SDK, e o firebase/auth lança
// "Error: Database is closing/hidden" como unhandled rejection.
// Damos ao SDK uma cadeia de fallback: se indexedDB falhar, ele tenta
// localStorage e, em último caso, mantém a sessão só em memória — o login
// não quebra a página, só pode não persistir entre reloads nesse caso raro.
//
// IMPORTANTE: em ambientes onde IndexedDB existe pela metade (ex.: bots/
// scanners com UA de Chrome mas faltando `IDBRequest`), a própria lógica
// de detecção do firebase/auth quebra com "Cannot read properties of
// undefined (reading 'toLowerCase')" — um bug interno do SDK, não do
// nosso código (visto em produção, Sentry JAVASCRIPT-NEXTJS-B). Como
// isso acontece de forma assíncrona dentro do SDK, o try/catch abaixo
// (só cobre a chamada síncrona de initializeAuth) não pega esse erro.
// A defesa real é nem deixar o Firebase tentar: só incluímos
// indexedDBLocalPersistence na cadeia quando o ambiente realmente tem
// as duas APIs que o SDK espera.
export function supportsIndexedDbPersistence(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && typeof IDBRequest !== 'undefined';
  } catch {
    return false;
  }
}

function createAuth() {
  if (typeof window === 'undefined') return getAuth(app)
  try {
    return initializeAuth(app, {
      persistence: supportsIndexedDbPersistence()
        ? [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence]
        : [browserLocalPersistence, inMemoryPersistence],
      // getAuth() inclui um popupRedirectResolver por padrão; initializeAuth()
      // não. Sem isso, signInWithPopup/signInWithRedirect (login com Google)
      // lança "auth/argument-error" ao tentar resolver o fluxo OAuth.
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  } catch {
    // initializeAuth já foi chamado para este app (ex.: hot-reload em dev)
    return getAuth(app)
  }
}

export const auth = createAuth()

// Cache local persistente (IndexedDB): o app continua funcionando com
// internet ruim/instável na loja, as vendas ficam guardadas no
// aparelho e sincronizam sozinhas assim que a conexão volta, sem o
// vendedor perceber nada nem precisar refazer a venda.
// IndexedDB só existe no navegador, então no servidor (SSR/build) cai
// pro cache em memória, que é o suficiente já que não há usuário ali.
// Mesma checagem defensiva do Auth acima: ambiente com IndexedDB pela
// metade cai pro cache em memória em vez de arriscar o mesmo tipo de
// bug interno do SDK.
export const db = initializeFirestore(app, {
  localCache:
    typeof window !== 'undefined' && supportsIndexedDbPersistence()
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
})

export const storage = getStorage(app)
export default app
