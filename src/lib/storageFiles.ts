import { randomUUID } from 'node:crypto';
import { adminStorage } from '@/lib/firebase/admin';

/** Arquivos do Storage que as limpezas apagam (o real aqui; um falso nos testes). */
export interface StoredFiles {
  /** Apaga tudo o que começa com o prefixo (ex.: "email-attachments/<id>/"). */
  deletePrefix(prefix: string): Promise<void>;
  /** Apaga um arquivo; se já não existe, tudo bem. */
  deletePath(path: string): Promise<void>;
  /**
   * Tira do ar o acesso público dos arquivos do prefixo (anexos antigos de
   * e-mail eram públicos) e deixa a equipe abrir pelo painel. Devolve quantos
   * mudaram; os já fechados ficam marcados e não são mexidos de novo.
   */
  privatizePrefix(prefix: string): Promise<number>;
  /** Caminhos dos arquivos do prefixo criados antes de `beforeMs`. */
  listOlderThan(prefix: string, beforeMs: number): Promise<string[]>;
}

export function storageFiles(): StoredFiles {
  return {
    deletePrefix: async prefix => { await adminStorage.bucket().deleteFiles({ prefix }); },
    deletePath: async path => { await adminStorage.bucket().file(path).delete({ ignoreNotFound: true }); },
    listOlderThan: async (prefix, beforeMs) => {
      const [found] = await adminStorage.bucket().getFiles({ prefix });
      return found.filter(f => Date.parse(String(f.metadata.timeCreated ?? '')) < beforeMs).map(f => f.name);
    },
    privatizePrefix: async prefix => {
      const [found] = await adminStorage.bucket().getFiles({ prefix });
      let changed = 0;
      for (const file of found) {
        const custom = (file.metadata.metadata ?? {}) as Record<string, unknown>;
        if (custom.privado === '1') continue;
        // Bucket com acesso uniforme não tem ACL por arquivo: já é privado.
        await file.makePrivate().catch(() => {});
        await file.setMetadata({ metadata: privateFileMetadata(custom.firebaseStorageDownloadTokens) });
        changed++;
      }
      return changed;
    },
  };
}

/**
 * Metadados de um arquivo privado que a equipe abre pelo painel: o token do
 * Firebase Storage deixa o SDK montar o endereço (só para quem as regras
 * deixam ler) e a marca evita mexer de novo no arquivo.
 */
export function privateFileMetadata(token?: unknown): { privado: '1'; firebaseStorageDownloadTokens: string } {
  return { privado: '1', firebaseStorageDownloadTokens: typeof token === 'string' && token ? token : randomUUID() };
}
