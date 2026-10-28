import { getStorage } from 'firebase/storage'
import app from './client'
import { ensureAppCheck } from './appCheck'

// Separado do client.ts: só o cadastro de produto (painel) sobe fotos.
// No client.ts o SDK de Storage ia no bundle de todo visitante da loja.
ensureAppCheck()
export const storage = getStorage(app)
