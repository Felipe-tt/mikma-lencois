// Firestore do navegador, separado do Auth: o SDK do Firestore é o maior
// pedaço de JS do site, e assim só baixa nas páginas que leem o banco.
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from 'firebase/firestore'
import app, { supportsIndexedDbPersistence } from '@/lib/firebase/client'
import { ensureAppCheck } from '@/lib/firebase/appCheck'

// Antes do primeiro pedido ao banco (ver appCheck.ts).
ensureAppCheck()

// Cache local persistente (IndexedDB): o app continua funcionando com
// internet ruim/instável na loja, as vendas ficam guardadas no
// aparelho e sincronizam sozinhas assim que a conexão volta, sem o
// vendedor perceber nada nem precisar refazer a venda.
// IndexedDB só existe no navegador, então no servidor (SSR/build) cai
// pro cache em memória, que é o suficiente já que não há usuário ali.
// Mesma checagem defensiva do Auth (client.ts): ambiente com IndexedDB pela
// metade cai pro cache em memória em vez de arriscar o mesmo tipo de
// bug interno do SDK.
export const db = initializeFirestore(app, {
  localCache:
    typeof window !== 'undefined' && supportsIndexedDbPersistence()
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
})

// Desenvolvimento local com Firebase Emulator Suite (Firestore):
// NEXT_PUBLIC_FIREBASE_EMULATORS=1 no .env.local. Nunca setado em produção.
if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === '1' && typeof window !== 'undefined') {
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  } catch {
    // Já conectado (hot-reload em dev)
  }
}
