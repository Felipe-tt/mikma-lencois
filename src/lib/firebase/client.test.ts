import { describe, it, expect } from 'vitest';
import { supportsIndexedDbPersistence } from './client';

describe('supportsIndexedDbPersistence', () => {
  it('retorna false em ambiente sem indexedDB/IDBRequest (ex: Node, SSR)', () => {
    // Nesse ambiente de teste (Node) nenhum dos dois globais existe de
    // verdade, então isso confirma o caminho defensivo que evita o bug
    // do SDK do Firebase em ambientes com suporte incompleto a
    // IndexedDB (ver comentário em src/lib/firebase/client.ts e Sentry
    // JAVASCRIPT-NEXTJS-B).
    expect(supportsIndexedDbPersistence()).toBe(false);
  });

  it('não lança erro mesmo se os globais não existirem', () => {
    expect(() => supportsIndexedDbPersistence()).not.toThrow();
  });
});
