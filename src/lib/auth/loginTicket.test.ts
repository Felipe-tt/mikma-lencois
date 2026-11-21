import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { TICKET_TTL_MS, isTrustedLogin, issueLoginTicket, needsTicket, requireTrustedLogin, trustLogin, trustRequiredSinceMs } from './loginTicket';

type Data = Record<string, unknown>;

/** Firestore em memória: doc, get/set e transação (aplica as escritas no fim). */
function fakeDb() {
  const docs = new Map<string, Data>();
  const snapOf = (path: string) => {
    const d = docs.get(path);
    return { exists: d !== undefined, get: (k: string) => d?.[k] };
  };
  const db = {
    docs,
    collection: (col: string) => ({
      doc: (id: string) => ({ path: `${col}/${id}`, get: async () => snapOf(`${col}/${id}`) }),
    }),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (ref: { path: string }) => snapOf(ref.path),
        set: (ref: { path: string }, v: Data, o?: { merge?: boolean }) => {
          writes.push(() => docs.set(ref.path, o?.merge ? { ...docs.get(ref.path), ...v } : { ...v }));
        },
      };
      const out = await fn(tx);
      writes.forEach(w => w());
      return out;
    },
  };
  return db as typeof db & Firestore;
}

const LOGIN = Date.parse('2026-12-01T12:00:00Z');
function token(over: Record<string, unknown> = {}, firebase: Record<string, unknown> = { sign_in_provider: 'password' }): DecodedIdToken {
  return { uid: 'u1', email: 'maria@x.com', auth_time: LOGIN / 1000, firebase, ...over } as unknown as DecodedIdToken;
}

describe('quem precisa da checagem do site', () => {
  it('só login com senha, sem segunda etapa, depois da trava', () => {
    expect(needsTicket(token())).toBe(true);
    expect(needsTicket(token({}, { sign_in_provider: 'google.com' }))).toBe(false);
    expect(needsTicket(token({}, { sign_in_provider: 'custom' }))).toBe(false);
    expect(needsTicket(token({}, { sign_in_provider: 'anonymous' }))).toBe(false);
    expect(needsTicket(token({}, { sign_in_provider: 'password', sign_in_second_factor: 'totp' }))).toBe(false);
    expect(needsTicket(token({ auth_time: Date.parse('2026-11-20T12:00:00Z') / 1000 }))).toBe(false);
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it('a data da trava vem do ambiente só se for válida', () => {
    vi.stubEnv('LOGIN_TICKET_SINCE', '2000-01-01T00:00:00Z');
    expect(needsTicket(token({ auth_time: Date.parse('2026-11-20T12:00:00Z') / 1000 }))).toBe(true);
    vi.stubEnv('LOGIN_TICKET_SINCE', 'qualquer coisa');
    expect(trustRequiredSinceMs()).toBe(Date.parse('2026-11-22T03:00:00Z'));
  });
});

describe('ticket de login', () => {
  it('ticket emitido antes do login torna o login confiável', async () => {
    const db = fakeDb();
    await issueLoginTicket(db, 'Maria@X.com', LOGIN - 5_000);
    expect(await trustLogin(db, token(), LOGIN + 2_000)).toBe(true);
    expect(await isTrustedLogin(db, token())).toBe(true);
    expect(await requireTrustedLogin(db, token())).toBeNull();
  });

  it('senha usada direto no Firebase (sem ticket) não é confiável', async () => {
    const db = fakeDb();
    expect(await trustLogin(db, token(), LOGIN + 2_000)).toBe(false);
    const res = await requireTrustedLogin(db, token());
    expect(res?.status).toBe(403);
    expect(await res?.json()).toMatchObject({ code: 'login_check' });
  });

  it('ticket de outro e-mail, depois do login ou velho demais não vale', async () => {
    const db = fakeDb();
    await issueLoginTicket(db, 'outra@x.com', LOGIN - 5_000);
    await issueLoginTicket(db, 'maria@x.com', LOGIN + 2 * 60_000);
    await issueLoginTicket(db, 'maria@x.com', LOGIN - TICKET_TTL_MS - 60_000);
    expect(await trustLogin(db, token(), LOGIN + 3 * 60_000)).toBe(false);
  });

  it('o ticket é gasto: não vale para um segundo login', async () => {
    const db = fakeDb();
    await issueLoginTicket(db, 'maria@x.com', LOGIN - 5_000);
    expect(await trustLogin(db, token(), LOGIN + 1_000)).toBe(true);
    const outro = token({ auth_time: LOGIN / 1000 + 30 });
    expect(await trustLogin(db, outro, LOGIN + 40_000)).toBe(false);
  });

  it('dois aparelhos entrando juntos: cada um com o seu ticket', async () => {
    const db = fakeDb();
    await issueLoginTicket(db, 'maria@x.com', LOGIN - 10_000);
    await issueLoginTicket(db, 'maria@x.com', LOGIN - 5_000);
    expect(await trustLogin(db, token(), LOGIN + 1_000)).toBe(true);
    expect(await trustLogin(db, token({ auth_time: LOGIN / 1000 + 1 }), LOGIN + 2_000)).toBe(true);
  });

  it('login já confiável continua confiável depois do prazo do ticket', async () => {
    const db = fakeDb();
    await issueLoginTicket(db, 'maria@x.com', LOGIN - 5_000);
    expect(await trustLogin(db, token(), LOGIN + 1_000)).toBe(true);
    expect(await trustLogin(db, token(), LOGIN + 30 * 24 * 3600_000)).toBe(true);
  });

  it('troca tardia (passou do prazo do ticket) não vale', async () => {
    const db = fakeDb();
    await issueLoginTicket(db, 'maria@x.com', LOGIN - 5_000);
    expect(await trustLogin(db, token(), LOGIN + TICKET_TTL_MS + 1_000)).toBe(false);
  });

  it('Google e convidado são confiáveis sem ticket', async () => {
    const db = fakeDb();
    expect(await trustLogin(db, token({}, { sign_in_provider: 'google.com' }))).toBe(true);
    expect(await isTrustedLogin(db, token({}, { sign_in_provider: 'custom' }))).toBe(true);
  });

  it('o e-mail não fica legível no banco', async () => {
    const db = fakeDb();
    await issueLoginTicket(db, 'maria@x.com', LOGIN);
    expect([...db.docs.keys()].join()).not.toContain('maria');
  });
});
