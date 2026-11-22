import { describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { customerLoginVia, forgetUserDevices, isDeviceId, noteCustomerLogin, unusualLoginPlace, type DeviceAlertDeps } from './userDevices';

type Data = Record<string, unknown>;

/**
 * Firestore em memória: doc get/set (com merge)/delete e transação (aplica as
 * escritas no fim). Uma transação por vez, como o Firestore faz com duas que
 * mexem no mesmo documento.
 */
function fakeDb() {
  const docs = new Map<string, Data>();
  let queue: Promise<unknown> = Promise.resolve();
  const snapOf = (path: string) => {
    const d = docs.get(path);
    return { exists: d !== undefined, get: (k: string) => d?.[k] };
  };
  const write = (path: string, v: Data, opts?: { merge?: boolean }) => {
    docs.set(path, opts?.merge ? { ...docs.get(path), ...v } : { ...v });
  };
  const db = {
    docs,
    collection: (col: string) => ({
      doc: (id: string) => ({
        path: `${col}/${id}`,
        get: async () => snapOf(`${col}/${id}`),
        set: async (v: Data, opts?: { merge?: boolean }) => { write(`${col}/${id}`, v, opts); },
        delete: async () => { docs.delete(`${col}/${id}`); },
      }),
    }),
    runTransaction: <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const run = async () => {
        const writes: Array<() => void> = [];
        const tx = {
          get: async (ref: { path: string }) => snapOf(ref.path),
          set: (ref: { path: string }, v: Data, opts?: { merge?: boolean }) => { writes.push(() => write(ref.path, v, opts)); },
        };
        const out = await fn(tx);
        writes.forEach(w => w());
        return out;
      };
      const next = queue.then(run, run);
      queue = next.catch(() => {});
      return next;
    },
  };
  return db as typeof db & Firestore;
}

const NOW = Date.parse('2026-12-01T12:00:00Z');
const DAY = 24 * 3600_000;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const CELULAR = 'celular-da-maria-aaaaaa';
const OUTRO = 'aparelho-de-outra-pessoa';

function login(over: Record<string, unknown> = {}, provider = 'password'): DecodedIdToken {
  return { uid: 'u1', email: 'maria@x.com', auth_time: (NOW - 30_000) / 1000, firebase: { sign_in_provider: provider }, ...over } as unknown as DecodedIdToken;
}

function deps(over: Partial<DeviceAlertDeps> = {}) {
  const sent: Array<{ to: string; subject: string; text: string; html: string }> = [];
  const d: DeviceAlertDeps = {
    // Conta antiga: o primeiro aparelho registrado não é o do cadastro.
    getUser: async () => ({ metadata: { creationTime: new Date(NOW - 300 * DAY).toUTCString() } as never }),
    allowAlert: async () => true,
    send: async mail => { sent.push(mail); },
    appUrl: 'https://mikma.com.br',
    ...over,
  };
  return { d, sent };
}

const access = (deviceId: string, userAgent = ANDROID, country: string | null = 'BR') => ({ deviceId, userAgent, ip: '200.1.2.3', place: 'Blumenau, Santa Catarina, Brasil', country });
const devicesOf = (db: ReturnType<typeof fakeDb>) => (db.docs.get('userDevices/u1')?.devices ?? []) as Array<{ label: string; lastSeen: string }>;

describe('quem recebe o aviso', () => {
  it('cliente que entrou com senha ou Google; equipe, passkey, convidado e outro provedor não', () => {
    expect(customerLoginVia(login())).toBe('password');
    expect(customerLoginVia(login({}, 'google.com'))).toBe('google');
    for (const p of ['custom', 'anonymous', 'phone']) expect(customerLoginVia(login({}, p))).toBeNull();
    expect(customerLoginVia(login({ role: 'seller' }))).toBeNull();
    expect(customerLoginVia(login({ role: 'admin' }, 'google.com'))).toBeNull();
  });

  it('id do aparelho só no formato que o servidor gera', () => {
    expect(isDeviceId('AbCdEfGhIjKlMnOpQrStUvWx')).toBe(true);
    for (const v of ['curto', 'a'.repeat(65), 'tem espaço no meio do id', 'aspas"no;cookie=x123456', undefined, 42]) expect(isDeviceId(v)).toBe(false);
  });
});

describe('aviso de acesso por aparelho novo', () => {
  it('primeiro aparelho de conta antiga avisa: pode ser quem pegou a senha de uma conta parada', async () => {
    const db = fakeDb();
    const { d, sent } = deps();
    expect(await noteCustomerLogin(db, login(), access(CELULAR), d, NOW)).toBe('alerted');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('maria@x.com');
    expect(sent[0].text).toContain('Android · Chrome');
    expect(sent[0].text).toContain('Blumenau, Santa Catarina, Brasil (IP 200.1.2.3)');
    expect(sent[0].text).toContain('https://mikma.com.br/entrar?esqueci=1');
    expect(db.docs.get('userDevices/u1')?.lastAlertAt).toBe(new Date(NOW).toISOString());
  });

  it('primeiro aparelho de conta criada agora é o do cadastro: só guarda', async () => {
    const db = fakeDb();
    const { d, sent } = deps({ getUser: async () => ({ metadata: { creationTime: new Date(NOW - 60_000).toUTCString() } as never }) });
    expect(await noteCustomerLogin(db, login(), access(CELULAR), d, NOW)).toBe('remembered');
    expect(sent).toHaveLength(0);
    expect(devicesOf(db)).toHaveLength(1);
  });

  it('sem saber quando a conta foi criada, avisa', async () => {
    const { d, sent } = deps({ getUser: async () => { throw new Error('auth fora do ar'); } });
    expect(await noteCustomerLogin(fakeDb(), login(), access(CELULAR), d, NOW)).toBe('alerted');
    expect(sent).toHaveLength(1);
  });

  it('aparelho conhecido não avisa e atualiza o último acesso', async () => {
    const db = fakeDb();
    const { d, sent } = deps();
    await noteCustomerLogin(db, login(), access(CELULAR), d, NOW);
    const later = NOW + 5 * DAY;
    expect(await noteCustomerLogin(db, login({ auth_time: (later - 10_000) / 1000 }), access(CELULAR), d, later)).toBe('known');
    expect(sent).toHaveLength(1);
    expect(devicesOf(db)).toHaveLength(1);
    expect(devicesOf(db)[0].lastSeen).toBe(new Date(later).toISOString());
  });

  it('aparelho novo numa conta que já tem outro avisa a dona, com o link de criar senha nova', async () => {
    const db = fakeDb();
    const { d, sent } = deps();
    await noteCustomerLogin(db, login(), access(CELULAR), d, NOW);
    const later = NOW + DAY;
    expect(await noteCustomerLogin(db, login({ auth_time: (later - 5_000) / 1000 }), access(OUTRO, WINDOWS), d, later)).toBe('alerted');
    expect(sent).toHaveLength(2);
    expect(sent[1].subject).toBe('Novo acesso à sua conta da Mikma Lençóis');
    expect(sent[1].text).toContain('Windows · Chrome');
    expect(sent[1].text).toContain('com e-mail e senha');
    expect(devicesOf(db).map(x => x.label)).toEqual(['Android · Chrome', 'Windows · Chrome']);
  });

  it('pelo Google, o e-mail leva a Minha conta (sair de todos os aparelhos)', async () => {
    const { d, sent } = deps();
    await noteCustomerLogin(fakeDb(), login({}, 'google.com'), access(OUTRO), d, NOW);
    expect(sent[0].text).toContain('pelo Google');
    expect(sent[0].text).toContain('https://mikma.com.br/conta');
    expect(sent[0].text).not.toContain('esqueci');
  });

  it('sessão antiga vista pela primeira vez só entra na lista: não é acesso novo', async () => {
    const db = fakeDb();
    const { d, sent } = deps();
    const old = login({ auth_time: (NOW - 3 * DAY) / 1000 });
    expect(await noteCustomerLogin(db, old, access(CELULAR), d, NOW)).toBe('remembered');
    expect(sent).toHaveLength(0);
    expect(devicesOf(db)).toHaveLength(1);
  });

  it('um aviso por login, mesmo com duas abas pedindo ao mesmo tempo', async () => {
    const db = fakeDb();
    const { d, sent } = deps();
    await noteCustomerLogin(db, login({ auth_time: (NOW - 2 * DAY) / 1000 }), access(CELULAR), d, NOW);
    const both = await Promise.all([
      noteCustomerLogin(db, login(), access('aba-um-aaaaaaaaaaaaaaaaa'), d, NOW),
      noteCustomerLogin(db, login(), access('aba-dois-aaaaaaaaaaaaaaa'), d, NOW),
    ]);
    expect(both.sort()).toEqual(['alerted', 'remembered']);
    expect(sent).toHaveLength(1);
  });

  it('no máximo o limite de avisos por conta', async () => {
    const db = fakeDb();
    const { d, sent } = deps({ allowAlert: async () => false });
    expect(await noteCustomerLogin(db, login(), access(CELULAR), d, NOW)).toBe('limited');
    expect(sent).toHaveLength(0);
    expect(devicesOf(db)).toHaveLength(1);
  });

  it('aparelho sem uso por 13 meses sai da lista; voltar por ele depois avisa', async () => {
    const db = fakeDb();
    const { d, sent } = deps();
    await noteCustomerLogin(db, login(), access(CELULAR), d, NOW);
    const later = NOW + 401 * DAY;
    expect(await noteCustomerLogin(db, login({ auth_time: (later - 5_000) / 1000 }), access(CELULAR), d, later)).toBe('alerted');
    expect(sent).toHaveLength(2);
    expect(devicesOf(db)).toHaveLength(1);
  });

  it('guarda no máximo 20 aparelhos, sem o id em claro', async () => {
    const db = fakeDb();
    const { d } = deps();
    for (let i = 0; i < 25; i++) await noteCustomerLogin(db, login(), access(`aparelho-${String(i).padStart(2, '0')}-aaaaaaaaaaaa`), d, NOW + i);
    expect(devicesOf(db)).toHaveLength(20);
    expect(JSON.stringify(db.docs.get('userDevices/u1'))).not.toContain('aparelho-');
  });

  it('equipe, passkey e id de aparelho estranho não mexem em nada', async () => {
    const db = fakeDb();
    const { d, sent } = deps();
    expect(await noteCustomerLogin(db, login({ role: 'admin' }), access(CELULAR), d, NOW)).toBe('skipped');
    expect(await noteCustomerLogin(db, login({}, 'custom'), access(CELULAR), d, NOW)).toBe('skipped');
    expect(await noteCustomerLogin(db, login(), access('x'), d, NOW)).toBe('skipped');
    expect(db.docs.size).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('conta apagada: a lista sai junto', async () => {
    const db = fakeDb();
    await noteCustomerLogin(db, login(), access(CELULAR), deps().d, NOW);
    await forgetUserDevices(db, 'u1');
    expect(db.docs.size).toBe(0);
  });

  it('falha no envio do e-mail sobe para quem chamou (a rota segura e segue o login)', async () => {
    const send = vi.fn(async () => { throw new Error('resend fora do ar'); });
    await expect(noteCustomerLogin(fakeDb(), login(), access(CELULAR), deps({ send }).d, NOW)).rejects.toThrow('resend fora do ar');
  });
});

describe('países de onde a conta entrou', () => {
  it('guarda o país de cada login que valeu, o mais recente por último, até 10; a rede Tor nunca', async () => {
    const db = fakeDb();
    const { d } = deps();
    await noteCustomerLogin(db, login(), access(CELULAR, ANDROID, 'BR'), d, NOW);
    await noteCustomerLogin(db, login(), access(CELULAR, ANDROID, 'PT'), d, NOW + 1);
    await noteCustomerLogin(db, login(), access(CELULAR, ANDROID, 'BR'), d, NOW + 2);
    await noteCustomerLogin(db, login(), access(CELULAR, ANDROID, 'T1'), d, NOW + 3);
    await noteCustomerLogin(db, login(), access(CELULAR, ANDROID, null), d, NOW + 4);
    expect(db.docs.get('userDevices/u1')?.countries).toEqual(['PT', 'BR']);
    for (const [i, c] of ['AR', 'UY', 'CL', 'PY', 'BO', 'PE', 'CO', 'EC', 'VE', 'MX'].entries()) {
      await noteCustomerLogin(db, login(), access(CELULAR, ANDROID, c), d, NOW + 10 + i);
    }
    expect(db.docs.get('userDevices/u1')?.countries).toEqual(['AR', 'UY', 'CL', 'PY', 'BO', 'PE', 'CO', 'EC', 'VE', 'MX']);
  });
});

describe('login de lugar novo (pede a confirmação por e-mail)', () => {
  async function account() {
    const db = fakeDb();
    await noteCustomerLogin(db, login(), access(CELULAR, ANDROID, 'BR'), deps().d, NOW);
    return db;
  }

  it('aparelho novo, de um país de onde a conta nunca entrou: pede', async () => {
    expect(await unusualLoginPlace(await account(), 'u1', OUTRO, 'RU', NOW + DAY)).toBe(true);
  });

  it('aparelho novo, do país de costume: não pede (o aviso de acesso novo cobre)', async () => {
    expect(await unusualLoginPlace(await account(), 'u1', OUTRO, 'BR', NOW + DAY)).toBe(false);
  });

  it('o aparelho de sempre, viajando: não pede', async () => {
    expect(await unusualLoginPlace(await account(), 'u1', CELULAR, 'PT', NOW + DAY)).toBe(false);
  });

  it('rede Tor num aparelho novo pede sempre, mesmo sem países guardados; no aparelho de sempre, não', async () => {
    const db = await account();
    expect(await unusualLoginPlace(db, 'u1', OUTRO, 'T1', NOW + DAY)).toBe(true);
    expect(await unusualLoginPlace(db, 'u1', CELULAR, 'T1', NOW + DAY)).toBe(false);
    expect(await unusualLoginPlace(fakeDb(), 'u1', undefined, 'T1', NOW)).toBe(true);
  });

  it('sem países guardados (conta nova ou de antes disto) ou sem saber o país: não pede', async () => {
    expect(await unusualLoginPlace(fakeDb(), 'u1', OUTRO, 'RU', NOW)).toBe(false);
    expect(await unusualLoginPlace(await account(), 'u1', OUTRO, null, NOW + DAY)).toBe(false);
  });

  it('aparelho sem uso há 13 meses conta como novo; cookie estranho também', async () => {
    const db = await account();
    expect(await unusualLoginPlace(db, 'u1', CELULAR, 'RU', NOW + 401 * DAY)).toBe(true);
    expect(await unusualLoginPlace(db, 'u1', 'x', 'RU', NOW + DAY)).toBe(true);
  });
});

describe('login que a dona acabou de confirmar pelo e-mail', () => {
  it('não manda o aviso de acesso novo de novo; sem a confirmação, manda', async () => {
    const db = fakeDb();
    await noteCustomerLogin(db, login({ auth_time: (NOW - 2 * DAY) / 1000 }), access(CELULAR), deps().d, NOW);
    const confirmed = deps({ confirmedByEmail: async () => true });
    expect(await noteCustomerLogin(db, login(), access(OUTRO), confirmed.d, NOW)).toBe('remembered');
    expect(confirmed.sent).toHaveLength(0);
    const other = deps({ confirmedByEmail: async () => false });
    expect(await noteCustomerLogin(db, login({ auth_time: (NOW - 1_000) / 1000 }), access('mais-um-aparelho-aaaaaaa'), other.d, NOW)).toBe('alerted');
  });
});
