import { getStorage } from 'firebase/storage'
import app from './client'

// Separado do client.ts: só o cadastro de produto (painel) sobe fotos.
// No client.ts o SDK de Storage ia no bundle de todo visitante da loja.
export const storage = getStorage(app)
