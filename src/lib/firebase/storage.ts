import { connectStorageEmulator, getStorage } from 'firebase/storage'
import app from './client'
import { ensureAppCheck } from './appCheck'

// Separado do client.ts: só o cadastro de produto (painel) sobe fotos.
// No client.ts o SDK de Storage ia no bundle de todo visitante da loja.
ensureAppCheck()
export const storage = getStorage(app)

// Testes ponta a ponta: Storage do emulador (NEXT_PUBLIC_FIREBASE_EMULATORS=1, nunca em produção).
if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === '1' && typeof window !== 'undefined') {
  try { connectStorageEmulator(storage, '127.0.0.1', 9199) } catch { /* já conectado */ }
}
