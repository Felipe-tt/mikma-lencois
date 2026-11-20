import { adminStorage } from '@/lib/firebase/admin';

/** Arquivos do Storage que as limpezas apagam (o real aqui; um falso nos testes). */
export interface StoredFiles {
  /** Apaga tudo o que começa com o prefixo (ex.: "email-attachments/<id>/"). */
  deletePrefix(prefix: string): Promise<void>;
  /** Apaga um arquivo; se já não existe, tudo bem. */
  deletePath(path: string): Promise<void>;
}

export function storageFiles(): StoredFiles {
  return {
    deletePrefix: async prefix => { await adminStorage.bucket().deleteFiles({ prefix }); },
    deletePath: async path => { await adminStorage.bucket().file(path).delete({ ignoreNotFound: true }); },
  };
}
