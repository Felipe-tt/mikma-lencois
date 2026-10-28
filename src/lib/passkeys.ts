import { randomBytes } from 'crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

/**
 * Login com passkey (WebAuthn): a chave fica no aparelho (Face ID, digital,
 * PIN do celular ou do computador) e o site guarda só a chave pública.
 * Não há senha para vazar nem para digitar em site falso: o navegador só
 * entrega a passkey para o domínio certo.
 *
 * Firestore (as regras não liberam nada disso para o cliente):
 * - passkeys/{credentialId}: dono, chave pública, contador e nome;
 * - webauthnChallenges/{id}: desafio de uso único, vale 5 minutos.
 *
 * Depois de conferir a assinatura, o servidor gera um custom token do
 * Firebase e o navegador entra com signInWithCustomToken. O Admin SDK
 * assina com a chave da service account (FIREBASE_PRIVATE_KEY), sem
 * precisar de permissão de IAM.
 */

export const MAX_PASSKEYS = 10;
const CHALLENGE_TTL_MS = 5 * 60_000;

export class PasskeyError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface PasskeyRecord {
  uid: string;
  publicKey: string; // base64url
  counter: number;
  transports: AuthenticatorTransport[];
  deviceType: string;
  backedUp: boolean;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Lista pública (para o perfil): sem chave pública nem contador. */
export interface PasskeySummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  synced: boolean;
}

/** Domínio e origem aceitos, a partir do endereço do site. */
export function relyingParty(appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://mikma.com.br') {
  const url = new URL(appUrl);
  const rpID = url.hostname.replace(/^www\./, '');
  const origins = [url.origin];
  // O site responde no domínio sem www; com www a passkey vale igual.
  if (url.protocol === 'https:') origins.push(`https://www.${rpID}`, `https://${rpID}`);
  return { rpID, rpName: 'Mikma Lençóis', origins: [...new Set(origins)] };
}

const passkeys = () => adminDb.collection('passkeys');
const challenges = () => adminDb.collection('webauthnChallenges');

type ChallengeKind = 'register' | 'login';

async function saveChallenge(challenge: string, kind: ChallengeKind, uid?: string): Promise<string> {
  const id = randomBytes(16).toString('hex');
  // expireAt (Timestamp) permite ligar uma política de TTL no Firestore
  // para apagar desafios abandonados.
  await challenges().doc(id).set({ challenge, kind, uid: uid ?? null, expiresAt: Date.now() + CHALLENGE_TTL_MS, expireAt: new Date(Date.now() + CHALLENGE_TTL_MS) });
  return id;
}

/** Lê e apaga o desafio (uso único). Null se não existe, venceu ou é de outro tipo/conta. */
export async function consumeChallenge(id: unknown, kind: ChallengeKind, uid?: string): Promise<string | null> {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) return null;
  const ref = challenges().doc(id);
  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    const d = snap.data()!;
    if (d.kind !== kind || d.expiresAt < Date.now()) return null;
    if (kind === 'register' && d.uid !== uid) return null;
    return d.challenge as string;
  });
}

export function summarize(id: string, p: PasskeyRecord): PasskeySummary {
  return { id, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt, synced: p.backedUp };
}

export async function listPasskeys(uid: string): Promise<Array<{ id: string } & PasskeyRecord>> {
  const snap = await passkeys().where('uid', '==', uid).get();
  return snap.docs
    .map(d => ({ id: d.id, ...(d.data() as PasskeyRecord) }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Nome legível do aparelho, a partir do navegador que cadastrou. */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? '';
  const device =
    /iPhone/.test(ua) ? 'iPhone' :
    /iPad/.test(ua) ? 'iPad' :
    /Android/.test(ua) ? 'Android' :
    /Mac OS X|Macintosh/.test(ua) ? 'Mac' :
    /Windows/.test(ua) ? 'Windows' :
    /CrOS/.test(ua) ? 'Chromebook' :
    /Linux/.test(ua) ? 'Linux' : 'Aparelho';
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /SamsungBrowser/.test(ua) ? 'Samsung Internet' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? `${device} · ${browser}` : device;
}

export async function registrationOptions(user: { uid: string; email: string; name?: string }) {
  const existing = await listPasskeys(user.uid);
  if (existing.length >= MAX_PASSKEYS) throw new PasskeyError(`Limite de ${MAX_PASSKEYS} passkeys. Remova uma para criar outra.`);
  const { rpID, rpName } = relyingParty();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name || user.email,
    // userHandle = uid: no login, a passkey diz de quem é.
    userID: new TextEncoder().encode(user.uid),
    attestationType: 'none',
    excludeCredentials: existing.map(p => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  const challengeId = await saveChallenge(options.challenge, 'register', user.uid);
  return { options, challengeId };
}

export async function registerPasskey(uid: string, challengeId: unknown, response: RegistrationResponseJSON, userAgent: string | null): Promise<PasskeySummary> {
  const expectedChallenge = await consumeChallenge(challengeId, 'register', uid);
  if (!expectedChallenge) throw new PasskeyError('O pedido expirou. Tente de novo.');
  const { rpID, origins } = relyingParty();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new PasskeyError('Não foi possível confirmar a passkey. Tente de novo.');
  }
  if (!verification.verified) throw new PasskeyError('Não foi possível confirmar a passkey. Tente de novo.');
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  const ref = passkeys().doc(credential.id);
  const record: PasskeyRecord = {
    uid,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: (credential.transports ?? response.response.transports ?? []) as AuthenticatorTransport[],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    name: deviceLabel(userAgent),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists) throw new PasskeyError('Esta passkey já está cadastrada.');
    tx.set(ref, record);
  });
  return summarize(credential.id, record);
}

export async function authenticationOptions() {
  const { rpID } = relyingParty();
  // Sem allowCredentials: o aparelho oferece as passkeys deste site
  // (inclusive no preenchimento automático do campo de e-mail).
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
  const challengeId = await saveChallenge(options.challenge, 'login');
  return { options, challengeId };
}

/** Confere a passkey e devolve o custom token do Firebase para entrar. */
export async function authenticate(challengeId: unknown, response: AuthenticationResponseJSON): Promise<{ token: string; uid: string }> {
  const expectedChallenge = await consumeChallenge(challengeId, 'login');
  if (!expectedChallenge) throw new PasskeyError('O pedido expirou. Tente de novo.');
  if (typeof response?.id !== 'string' || !/^[A-Za-z0-9_-]{16,1400}$/.test(response.id)) {
    throw new PasskeyError('Passkey inválida.');
  }
  const ref = passkeys().doc(response.id);
  const snap = await ref.get();
  if (!snap.exists) throw new PasskeyError('Esta passkey não está cadastrada aqui. Entre com e-mail e senha.', 404);
  const stored = snap.data() as PasskeyRecord;

  // A passkey foi criada com userHandle = uid: se vier outro, não é dela.
  const userHandle = response.response?.userHandle;
  if (userHandle && userHandle !== isoBase64URL.fromUTF8String(stored.uid)) throw new PasskeyError('Passkey inválida.');

  const { rpID, origins } = relyingParty();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: response.id,
        publicKey: isoBase64URL.toBuffer(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports,
      },
    });
  } catch {
    throw new PasskeyError('Não foi possível confirmar a passkey. Tente de novo.', 401);
  }
  if (!verification.verified) throw new PasskeyError('Não foi possível confirmar a passkey. Tente de novo.', 401);

  const user = await adminAuth.getUser(stored.uid).catch(() => null);
  if (!user) throw new PasskeyError('Conta não encontrada.', 404);
  if (user.disabled) throw new PasskeyError('Esta conta está desativada. Fale com a loja pelo WhatsApp.', 403);

  await ref.update({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date().toISOString(), backedUp: verification.authenticationInfo.credentialBackedUp });
  // passkey: true vai no token de ID desta sessão: a passkey já é login
  // forte (aparelho + biometria/PIN) e vale como verificação em duas etapas
  // para quem é da equipe (ver hasSecondFactor em lib/staffMfa.ts).
  const token = await adminAuth.createCustomToken(stored.uid, { passkey: true });
  return { token, uid: stored.uid };
}

export async function removePasskey(uid: string, id: string): Promise<boolean> {
  const ref = passkeys().doc(id);
  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.uid !== uid) return false;
    tx.delete(ref);
    return true;
  });
}
