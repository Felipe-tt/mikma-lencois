import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { checkAuthStamp, saveAuthStamp } from './authStamp';

type Data = Record<string, unknown>;
function fakeDb() {
  const docs = new Map<string, Data>();
  const db = {
    docs,
    collection: (col: string) => ({
      doc: (id: string) => ({
        get: async () => { const d = docs.get(`${col}/${id}`); return { exists: !!d, get: (k: string) => d?.[k] }; },
        set: async (v: Data) => { docs.set(`${col}/${id}`, { ...v }); },
      }),
    }),
  };
  return db as typeof db & Firestore;
}

const T0 = 'Sat, 21 Nov 2026 10:00:00 GMT';
const T1 = 'Sun, 22 Nov 2026 04:00:00 GMT';
const conta = (over: Partial<{ email: string; tokensValidAfterTime: string }> = {}) => ({ uid: 'u1', email: 'Maria@X.com', tokensValidAfterTime: T0, ...over });

describe('marca da conta (senha ou e-mail trocado fora do site)', () => {
  it('conta sem marca ganha a marca e segue', async () => {
    const db = fakeDb();
    expect(await checkAuthStamp(db, conta(), 'maria@x.com')).toEqual({ status: 'ok' });
    expect(db.docs.get('auth_stamps/u1')).toMatchObject({ email: 'maria@x.com', validAfter: T0 });
    expect(await checkAuthStamp(db, conta())).toEqual({ status: 'ok' });
  });

  it('senha trocada por fora (o Firebase avança a marca): pede confirmação pelo e-mail da conta', async () => {
    const db = fakeDb();
    await saveAuthStamp(db, conta());
    expect(await checkAuthStamp(db, conta({ tokensValidAfterTime: T1 }))).toEqual({ status: 'changed', email: 'maria@x.com' });
  });

  it('mudança feita pelo site regrava a marca e não acusa nada', async () => {
    const db = fakeDb();
    await saveAuthStamp(db, conta());
    await saveAuthStamp(db, conta({ tokensValidAfterTime: T1 }));
    expect(await checkAuthStamp(db, conta({ tokensValidAfterTime: T1 }))).toEqual({ status: 'ok' });
  });

  it('e-mail trocado por fora: vale o de antes, da marca ou do cadastro', async () => {
    const db = fakeDb();
    await saveAuthStamp(db, conta());
    expect(await checkAuthStamp(db, conta({ email: 'invasor@y.com', tokensValidAfterTime: T1 }))).toEqual({ status: 'emailChanged', email: 'maria@x.com' });
    // Conta de antes da marca: o e-mail do cadastro denuncia a troca, e a marca não é criada.
    const outro = fakeDb();
    expect(await checkAuthStamp(outro, conta({ email: 'invasor@y.com' }), 'maria@x.com')).toEqual({ status: 'emailChanged', email: 'maria@x.com' });
    expect(outro.docs.size).toBe(0);
  });
});
