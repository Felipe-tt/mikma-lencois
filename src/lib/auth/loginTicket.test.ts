import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import {
  TICKET_TTL_MS, hashTicket, isTicketShape, isTrustedLogin, issueChallengeTicket, issueLoginTicket,
  needsTicket, requireTrustedLogin, trustLogin, trustRequiredSinceMs,
} from './loginTicket';

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
      doc: (id: string) => ({
        path: `${col}/${id}`,
        get: async () => snapOf(`${col}/${id}`),
        set: async (v: Data) => { docs.set(`${col}/${id}`, { ...v }); },
      }),
    }),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (ref: { path: string }) => snapOf(ref.path),
        set: (ref: { path: string }, v: Data) => { writes.push(() => docs.set(ref.path, { ...v })); },
        delete: (ref: { path: string }) => { writes.push(() => docs.delete(ref.path)); },
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
  afterEach(() => { vi.unstubAllEnvs(); });

  it('só login com senha, sem segunda etapa, depois da trava', () => {
    expect(needsTicket(token())).toBe(true);
    expect(needsTicket(token({}, { sign_in_provider: 'google.com' }))).toBe(false);
    expect(needsTicket(token({}, { sign_in_provider: 'custom' }))).toBe(false);
    expect(needsTicket(token({}, { sign_in_provider: 'anonymous' }))).toBe(false);
    expect(needsTicket(token({}, { sign_in_provider: 'password', sign_in_second_factor: 'totp' }))).toBe(false);
    expect(needsTicket(token({ auth_time: Date.parse('2026-11-20T12:00:00Z') / 1000 }))).toBe(false);
  });

  it('a data da trava vem do ambiente só se for válida', () => {
    vi.stubEnv('LOGIN_TICKET_SINCE', '2000-01-01T00:00:00Z');
    expect(needsTicket(token({ auth_time: Date.parse('2026-11-20T12:00:00Z') / 1000 }))).toBe(true);
    vi.stubEnv('LOGIN_TICKET_SINCE', 'qualquer coisa');
    expect(trustRequiredSinceMs()).toBe(Date.parse('2026-11-22T03:00:00Z'));
  });
});

describe('ticket do navegador que passou pela checagem', () => {
  it('o ticket deste navegador, emitido antes do login, torna o login confiável', async () => {
    const db = fakeDb();
    const ticket = await issueLoginTicket(db, 'Maria@X.com', LOGIN - 5_000);
    expect(isTicketShape(ticket)).toBe(true);
    expect(await trustLogin(db, token(), ticket, LOGIN + 2_000)).toBe(true);
    expect(await isTrustedLogin(db, token())).toBe(true);
    expect(await requireTrustedLogin(db, token())).toBeNull();
  });

  it('senha usada direto no Firebase, sem o ticket, não é confiável, mesmo com ticket emitido para o e-mail', async () => {
    const db = fakeDb();
    await issueLoginTicket(db, 'maria@x.com', LOGIN - 5_000); // o da dona da conta, que o atacante não tem
    expect(await trustLogin(db, token(), undefined, LOGIN + 2_000)).toBe(false);
    expect(await trustLogin(db, token(), 'x'.repeat(43), LOGIN + 2_000)).toBe(false);
    const res = await requireTrustedLogin(db, token());
    expect(res?.status).toBe(403);
    expect(await res?.json()).toMatchObject({ code: 'login_check' });
  });

  it('ticket de outro e-mail, emitido depois do login ou velho demais não vale', async () => {
    const db = fakeDb();
    const outro = await issueLoginTicket(db, 'outra@x.com', LOGIN - 5_000);
    expect(await trustLogin(db, token(), outro, LOGIN + 3_000)).toBe(false);
    const depois = await issueLoginTicket(db, 'maria@x.com', LOGIN + 2 * 60_000);
    expect(await trustLogin(db, token(), depois, LOGIN + 3 * 60_000)).toBe(false);
    const velho = await issueLoginTicket(db, 'maria@x.com', LOGIN - TICKET_TTL_MS - 60_000);
    expect(await trustLogin(db, token(), velho, LOGIN + 3_000)).toBe(false);
  });

  it('o ticket é gasto: não vale para um segundo login', async () => {
    const db = fakeDb();
    const ticket = await issueLoginTicket(db, 'maria@x.com', LOGIN - 5_000);
    expect(await trustLogin(db, token(), ticket, LOGIN + 1_000)).toBe(true);
    expect(await trustLogin(db, token({ auth_time: LOGIN / 1000 + 30 }), ticket, LOGIN + 40_000)).toBe(false);
  });

  it('login já confiável continua confiável sem ticket e depois do prazo', async () => {
    const db = fakeDb();
    const ticket = await issueLoginTicket(db, 'maria@x.com', LOGIN - 5_000);
    expect(await trustLogin(db, token(), ticket, LOGIN + 1_000)).toBe(true);
    expect(await trustLogin(db, token(), undefined, LOGIN + 30 * 24 * 3600_000)).toBe(true);
  });

  it('confirmação por e-mail: o ticket é o id do desafio, que só a aba que pediu tem', async () => {
    const db = fakeDb();
    const challenge = 'c'.repeat(43);
    await issueChallengeTicket(db, 'maria@x.com', hashTicket(challenge), LOGIN - 5_000);
    expect(await trustLogin(db, token(), 'd'.repeat(43), LOGIN + 1_000)).toBe(false);
    expect(await trustLogin(db, token(), challenge, LOGIN + 1_000)).toBe(true);
  });

  it('Google e convidado são confiáveis sem ticket', async () => {
    const db = fakeDb();
    expect(await trustLogin(db, token({}, { sign_in_provider: 'google.com' }))).toBe(true);
    expect(await isTrustedLogin(db, token({}, { sign_in_provider: 'custom' }))).toBe(true);
  });

  it('nem o e-mail nem o ticket ficam legíveis no banco', async () => {
    const db = fakeDb();
    const ticket = await issueLoginTicket(db, 'maria@x.com', LOGIN);
    const stored = JSON.stringify([...db.docs.entries()]);
    expect(stored).not.toContain('maria');
    expect(stored).not.toContain(ticket);
  });
});
