import { createHash } from 'node:crypto';
import type { DecodedIdToken, UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { deviceLabel } from '@/lib/passkeys';
import { newDeviceEmail } from '@/lib/email/newDeviceEmail';
import { DAY_MS, RETENTION } from '@/lib/retention';

/**
 * Aviso de acesso por aparelho novo, para clientes (a equipe tem o dela, em
 * lib/staffDevices.ts). A confirmação por e-mail do login só pega senha que
 * já vazou ou acesso fora do normal: uma senha roubada de outro jeito
 * entrava em silêncio. Agora, quando a conta é aberta num aparelho que ela
 * não usava, a dona recebe um e-mail com quando, onde e como foi, e o que
 * fazer se não foi ela.
 *
 * Roda na troca do login confiável (/api/auth/trust), por onde passa todo
 * login com senha ou Google que abre os dados da conta: quem entra direto no
 * Firebase para fugir do aviso fica sem endereço, pedidos e CPF.
 *
 * O aparelho é o cookie da equipe (id aleatório, HttpOnly, 1 ano). No banco
 * ficam só o hash dele, o tipo do aparelho e as datas (userDevices/{uid}).
 */
const COLLECTION = 'userDevices';
const MAX_DEVICES = 20;
/** Aparelho sem uso por 13 meses sai da lista (o cookie dura 1 ano). */
const DEVICE_FORGET_MS = RETENTION.knownDeviceDays * DAY_MS;
/** Primeiro aparelho de conta criada há menos de 1 dia: é o do cadastro. */
const SIGNUP_GRACE_MS = 24 * 3600_000;
/**
 * Só login recente é acesso novo. Uma sessão antiga vista aqui pela primeira
 * vez (de antes deste aviso existir) só entra na lista. O login com senha
 * só vira confiável nesse prazo (TICKET_TTL_MS), então ninguém foge do aviso
 * esperando.
 */
const FRESH_LOGIN_MS = 15 * 60_000;

const hashId = (id: string) => createHash('sha256').update(id).digest('hex').slice(0, 32);

/** Cookie que o navegador manda: base64url, do tamanho que o servidor gera. */
export const isDeviceId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(v);

/** Login de cliente com senha ou Google. Passkey e convidado não; a equipe tem o aviso dela. */
export function customerLoginVia(decoded: DecodedIdToken): 'password' | 'google' | null {
  const role = (decoded as { role?: unknown }).role;
  if (role === 'seller' || role === 'admin') return null;
  const provider = (decoded.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
  return provider === 'password' ? 'password' : provider === 'google.com' ? 'google' : null;
}

interface Device { id: string; label: string; firstSeen: string; lastSeen?: string }

/**
 * Guarda o aparelho na lista da conta. 'first': a lista estava vazia (o
 * cadastro, ou o primeiro login depois deste aviso existir). `alertFor` é o
 * auth_time do login que pode gerar aviso; volta `alert: true` só uma vez
 * por login, mesmo com várias abas pedindo ao mesmo tempo.
 */
async function rememberDevice(db: Firestore, uid: string, deviceId: string, label: string, now: number, alertFor: number | null) {
  const ref = db.collection(COLLECTION).doc(uid);
  const hash = hashId(deviceId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const iso = new Date(now).toISOString();
    const all: Device[] = snap.exists ? (snap.get('devices') as Device[] | undefined) ?? [] : [];
    const recent = all.filter(d => now - Date.parse(d.lastSeen ?? d.firstSeen) < DEVICE_FORGET_MS);
    const known = recent.some(d => d.id === hash);
    const devices = known
      ? recent.map(d => (d.id === hash ? { ...d, lastSeen: iso } : d))
      : [...recent, { id: hash, label, firstSeen: iso, lastSeen: iso }].slice(-MAX_DEVICES);
    const seen: 'known' | 'new' | 'first' = known ? 'known' : all.length === 0 ? 'first' : 'new';
    const alert = seen !== 'known' && alertFor !== null && snap.get('alertedLogin') !== alertFor;
    tx.set(ref, { devices, updatedAt: iso, ...(alert ? { alertedLogin: alertFor } : {}) }, { merge: true });
    return { seen, alert };
  });
}

export interface LoginAccess {
  deviceId: string;
  userAgent: string | null;
  ip: string;
  place: string | null;
}

export interface DeviceAlertDeps {
  /** adminAuth.getUser: data de criação da conta (só no primeiro aparelho). */
  getUser: (uid: string) => Promise<Pick<UserRecord, 'metadata'>>;
  /** Limite de avisos por conta (rateLimit). */
  allowAlert: (uid: string) => Promise<boolean>;
  send: (mail: { to: string; subject: string; text: string; html: string }) => Promise<unknown>;
  /** Base dos links do e-mail. */
  appUrl: string;
}

export type DeviceOutcome = 'skipped' | 'known' | 'remembered' | 'limited' | 'alerted';

/** Registra o aparelho deste login de cliente e avisa a dona da conta se for novo. */
export async function noteCustomerLogin(
  db: Firestore, decoded: DecodedIdToken, access: LoginAccess, deps: DeviceAlertDeps, now = Date.now(),
): Promise<DeviceOutcome> {
  const via = customerLoginVia(decoded);
  if (!via || !decoded.email || !isDeviceId(access.deviceId)) return 'skipped';
  const fresh = now - decoded.auth_time * 1000 <= FRESH_LOGIN_MS;
  const label = deviceLabel(access.userAgent);
  const { seen, alert } = await rememberDevice(db, decoded.uid, access.deviceId, label, now, fresh ? decoded.auth_time : null);
  if (seen === 'known') return 'known';
  if (!alert) return 'remembered';
  if (seen === 'first') {
    // Conta recém-criada: este é o aparelho do cadastro. Sem a data, avisa.
    const created = Date.parse((await deps.getUser(decoded.uid).catch(() => null))?.metadata.creationTime ?? '');
    if (now - created < SIGNUP_GRACE_MS) return 'remembered';
  }
  if (!await deps.allowAlert(decoded.uid)) return 'limited';

  await db.collection(COLLECTION).doc(decoded.uid).set({ lastAlertAt: new Date(now).toISOString() }, { merge: true });
  const mail = newDeviceEmail({
    email: decoded.email,
    when: new Date(now),
    device: label,
    place: access.place,
    ip: access.ip,
    via,
    actionUrl: via === 'google' ? `${deps.appUrl}/conta` : `${deps.appUrl}/entrar?esqueci=1`,
  });
  await deps.send({ to: decoded.email, ...mail });
  return 'alerted';
}

/** Conta apagada: a lista de aparelhos sai junto. */
export async function forgetUserDevices(db: Firestore, uid: string): Promise<void> {
  await db.collection(COLLECTION).doc(uid).delete();
}
