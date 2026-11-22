import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import {
  TICKET_TTL_MS, forgetTrustedLogins, googleMatchesAccount, hashTicket, isTicketShape, isTrustedLogin, issueChallengeTicket,
  issueLoginTicket, needsTicket, requireTrustedLogin, trustLogin, trustRequiredSinceMs,
} from './loginTicket';
import { saveAuthStamp } from './authStamp';

type Data = Record<string, unknown>;

/** Firestore em memória: doc, get/set, consulta por igualdade, lote e transação (aplica as escritas no fim). */
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
      where: (field: string, _op: '==', value: unknown) => ({
        limit: (n: number) => ({
          get: async () => {
            const hits = [...docs].filter(([p, d]) => p.startsWith(`${col}/`) && d[field] === value).slice(0, n);
            return { empty: hits.length === 0, size: hits.length, docs: hits.map(([p]) => ({ ref: { path: p } })) };
          },
        }),
      }),
    }),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        delete: (ref: { path: string }) => { ops.push(() => docs.delete(ref.path)); },
        commit: async () => { ops.forEach(o => o()); },
      };
    },
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
    // Segunda etapa só isenta a equipe: o site nunca cadastra uma para cliente.
    expect(needsTicket(token({ role: 'admin' }, { sign_in_provider: 'password', sign_in_second_factor: 'totp' }))).toBe(false);
    expect(needsTicket(token({}, { sign_in_provider: 'password', sign_in_second_factor: 'totp' }))).toBe(true);
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

  it('passkey e convidado são confiáveis sem ticket; Google de antes da data também', async () => {
    const db = fakeDb();
    expect(await isTrustedLogin(db, token({}, { sign_in_provider: 'custom' }))).toBe(true);
    expect(await trustLogin(db, token({ auth_time: Date.parse('2026-11-22T08:00:00Z') / 1000 }, { sign_in_provider: 'google.com' }))).toBe(true);
  });

  it('nem o e-mail nem o ticket ficam legíveis no banco', async () => {
    const db = fakeDb();
    const ticket = await issueLoginTicket(db, 'maria@x.com', LOGIN);
    const stored = JSON.stringify([...db.docs.entries()]);
    expect(stored).not.toContain('maria');
    expect(stored).not.toContain(ticket);
  });
});

describe('entrada pelo Google', () => {
  const google = () => token({}, { sign_in_provider: 'google.com' });
  const conta = (googleEmail: string, over: Record<string, unknown> = {}) => ({
    uid: 'u1', email: 'maria@x.com', tokensValidAfterTime: 'Sat, 21 Nov 2026 10:00:00 GMT',
    providerData: [{ providerId: 'password', email: 'maria@x.com' }, { providerId: 'google.com', email: googleEmail }],
    ...over,
  }) as never;

  it('vale se o Google vinculado é da própria conta (mesmo e-mail)', async () => {
    const db = fakeDb();
    expect(await trustLogin(db, google(), undefined, LOGIN + 1_000, { getUser: async () => conta('Maria@X.com') })).toBe(true);
    expect(await isTrustedLogin(db, google())).toBe(true);
  });

  it('Google de outra pessoa vinculado com a senha da conta não vale', async () => {
    const db = fakeDb();
    expect(await trustLogin(db, google(), undefined, LOGIN + 1_000, { getUser: async () => conta('invasor@gmail.com') })).toBe(false);
    expect((await requireTrustedLogin(db, google()))?.status).toBe(403);
    expect(googleMatchesAccount(conta('invasor@gmail.com'))).toBe(false);
    // Sem conferir a conta (sem getUser), também não.
    expect(await trustLogin(fakeDb(), google())).toBe(false);
  });

  it('conta mudada fora do site também não vale pelo Google', async () => {
    const db = fakeDb();
    await saveAuthStamp(db, conta('maria@x.com'));
    const mudada = conta('maria@x.com', { tokensValidAfterTime: 'Sun, 22 Nov 2026 04:00:00 GMT' });
    expect(await trustLogin(db, google(), undefined, LOGIN + 1_000, { getUser: async () => mudada })).toBe(false);
  });
});

describe('provedor que o site não usa', () => {
  it('telefone ou Facebook vinculados por fora nunca valem; de antes da data, seguem', async () => {
    const db = fakeDb();
    for (const p of ['phone', 'facebook.com']) {
      expect(await trustLogin(db, token({}, { sign_in_provider: p }), 'x'.repeat(43))).toBe(false);
      expect(await isTrustedLogin(db, token({}, { sign_in_provider: p }))).toBe(false);
    }
    expect(await isTrustedLogin(db, token({ auth_time: Date.parse('2026-11-22T08:00:00Z') / 1000 }, { sign_in_provider: 'phone' }))).toBe(true);
  });
});

describe('sair de todos os aparelhos e senha nova', () => {
  it('os logins confiáveis da conta saem; os de outras contas ficam', async () => {
    const db = fakeDb();
    const entrar = async (uid: string, email: string, segundos: number) => {
      const ticket = await issueLoginTicket(db, email, LOGIN - 5_000);
      const t = token({ uid, email, auth_time: LOGIN / 1000 + segundos });
      expect(await trustLogin(db, t, ticket, LOGIN + segundos * 1000 + 1_000)).toBe(true);
      return t;
    };
    const celular = await entrar('u1', 'maria@x.com', 0);
    const invasor = await entrar('u1', 'maria@x.com', 60);
    const outra = await entrar('u2', 'joana@x.com', 0);

    expect(await forgetTrustedLogins(db, 'u1')).toBe(2);
    // O token de quem entrou ainda não venceu, mas o login deixa de valer.
    expect(await isTrustedLogin(db, invasor)).toBe(false);
    expect(await isTrustedLogin(db, celular)).toBe(false);
    expect(await isTrustedLogin(db, outra)).toBe(true);
    expect(await forgetTrustedLogins(db, 'u1')).toBe(0);
  });
});
