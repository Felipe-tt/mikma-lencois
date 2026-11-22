import { createHash, randomBytes } from 'node:crypto';
import type { DecodedIdToken, UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { checkAuthStamp } from '@/lib/auth/authStamp';

/**
 * Login com senha passa pela checagem do site (/api/auth/login): limite de
 * tentativas, reCAPTCHA, senha conferida e, se ela já apareceu em
 * vazamento, confirmação por e-mail. Só que o Firebase Auth também aceita
 * a senha direto, com a chave pública do site, e aí nada disso roda: quem
 * tem uma senha vazada entrava assim e lia o CPF da pessoa.
 *
 * Por isso a conta (CPF e telefone, endereço, pedidos, exportar e apagar)
 * só abre para login com senha que passou pela checagem. A checagem
 * entrega um ticket ao navegador que passou por ela, e só a ele: um valor
 * aleatório que o banco guarda só como hash. Logo depois de entrar, o
 * navegador troca o ticket por "este login é confiável" (/api/auth/trust).
 * Quem entra direto no Firebase não tem o ticket, nem descobre quando a
 * dona da conta confirmou o próprio login. Passkey, convidado e equipe com
 * segunda etapa não precisam: a senha sozinha não entra por eles. Cliente
 * com segunda etapa e provedor que o site não usa precisam (staffSecondFactor,
 * foreignProvider): só foram parar na conta por fora.
 *
 * Google também passa por conferência (trustGoogleLogin): com a senha, dava
 * para vincular a própria conta Google à da pessoa e entrar por ela.
 */

/** Quanto tempo o ticket espera o login acontecer. */
export const TICKET_TTL_MS = 15 * 60 * 1000;
/** Folga de relógio entre o servidor e o Firebase Auth. */
const CLOCK_SKEW_MS = 60 * 1000;
const TRUST_REQUIRED_SINCE = '2026-11-22T03:00:00Z';
/**
 * Google: depois do deploy (quem entrou pelo Google com a página antiga
 * aberta não perde a conta no meio). A mesma data está em firestore.rules.
 */
const GOOGLE_TRUST_SINCE = '2026-11-23T06:00:00Z';

/**
 * Logins feitos antes desta trava continuam valendo: ninguém precisa entrar
 * de novo por causa dela. Os testes ponta a ponta antecipam a data
 * (LOGIN_TICKET_SINCE); data inválida volta à padrão, nunca libera tudo.
 */
export function trustRequiredSinceMs(provider: 'password' | 'google.com' = 'password'): number {
  const t = Date.parse(process.env.LOGIN_TICKET_SINCE ?? '');
  if (Number.isFinite(t)) return t;
  return Date.parse(provider === 'google.com' ? GOOGLE_TRUST_SINCE : TRUST_REQUIRED_SINCE);
}

const TICKETS = 'login_tickets';
const TRUSTED = 'trusted_logins';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** O e-mail não fica legível no banco, só o hash. */
const emailHash = (email: string) => sha256(email.trim().toLowerCase());

function trustId(decoded: DecodedIdToken): string {
  return `${decoded.uid}_${decoded.auth_time}`;
}

type FirebaseClaims = { sign_in_provider?: string; sign_in_second_factor?: string } | undefined;
const providerOf = (decoded: DecodedIdToken) => (decoded.firebase as FirebaseClaims)?.sign_in_provider;

/**
 * Segunda etapa só isenta a equipe, que a cadastra pelo painel. O site
 * nunca cadastra segunda etapa para cliente: numa conta de cliente, ela foi
 * cadastrada por fora, por quem tinha a senha (o Firebase deixa).
 */
function staffSecondFactor(decoded: DecodedIdToken): boolean {
  const role = (decoded as { role?: unknown }).role;
  return !!(decoded.firebase as FirebaseClaims)?.sign_in_second_factor && (role === 'seller' || role === 'admin');
}

/** Este login precisou passar pela checagem do site para ser confiável? */
export function needsTicket(decoded: DecodedIdToken): boolean {
  if (providerOf(decoded) !== 'password' || staffSecondFactor(decoded)) return false;
  return decoded.auth_time * 1000 >= trustRequiredSinceMs();
}

/** Entrada pelo Google que precisa da conferência do servidor (trustGoogleLogin). */
export function needsGoogleCheck(decoded: DecodedIdToken): boolean {
  if (providerOf(decoded) !== 'google.com' || staffSecondFactor(decoded)) return false;
  return decoded.auth_time * 1000 >= trustRequiredSinceMs('google.com');
}

/**
 * Provedor que o site não usa (telefone, Facebook...): só pode ter sido
 * vinculado por fora, com a senha da conta. Nunca vale. Passkey e convidado
 * (custom, anonymous) entram por tokens do próprio site.
 */
function foreignProvider(decoded: DecodedIdToken): boolean {
  const p = providerOf(decoded);
  if (!p || ['password', 'google.com', 'custom', 'anonymous'].includes(p) || staffSecondFactor(decoded)) return false;
  return decoded.auth_time * 1000 >= trustRequiredSinceMs('google.com');
}

const needsTrust = (decoded: DecodedIdToken) => needsTicket(decoded) || needsGoogleCheck(decoded) || foreignProvider(decoded);
const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/** Toda conta Google vinculada tem o e-mail da conta (o site nunca vincula outra). */
export function googleMatchesAccount(user: Pick<UserRecord, 'email' | 'providerData'>): boolean {
  const email = lower(user.email);
  const google = user.providerData.filter(p => p.providerId === 'google.com');
  return !!email && google.length > 0 && google.every(p => lower(p.email) === email);
}

/** Ticket que o navegador manda: base64url, do tamanho que o servidor gera. */
export function isTicketShape(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

/**
 * A checagem do site aprovou um login com senha (senha conferida no
 * servidor, confirmação por e-mail, cadastro ou senha nova). Devolve o
 * ticket, que vai só para o navegador que passou pela checagem. `ticket`
 * permite usar um valor que esse navegador já tem (o id do desafio por e-mail).
 */
export async function issueLoginTicket(db: Firestore, email: string, now = Date.now(), ticket = randomBytes(32).toString('base64url')): Promise<string> {
  await db.collection(TICKETS).doc(sha256(ticket)).set({
    emailHash: emailHash(email),
    issuedAt: now,
    expiresAt: new Date(now + TICKET_TTL_MS).toISOString(),
  });
  return ticket;
}

/** Hash do ticket (é o que fica no banco). */
export const hashTicket = sha256;

/**
 * Confirmação por e-mail: o ticket é o id do desafio, que só a aba que
 * pediu o login tem (o banco guarda o hash dele no desafio). O link do
 * e-mail pode ser aberto em outro aparelho; quem entra é a aba que esperava.
 */
export async function issueChallengeTicket(db: Firestore, email: string, challengeHash: string, now = Date.now()): Promise<void> {
  await db.collection(TICKETS).doc(challengeHash).set({
    emailHash: emailHash(email),
    issuedAt: now,
    expiresAt: new Date(now + TICKET_TTL_MS).toISOString(),
  });
}

/**
 * Logo depois de entrar: troca o ticket deste navegador, emitido para o
 * mesmo e-mail antes do login, por "este login é confiável". O ticket é
 * gasto. Sem ticket, só diz se o login já era confiável (o navegador
 * pergunta uma vez por sessão).
 */
export interface TrustDeps {
  /** Conta no Firebase Auth (adminAuth.getUser), para conferir a entrada pelo Google. */
  getUser?: (uid: string) => Promise<Pick<UserRecord, 'uid' | 'email' | 'tokensValidAfterTime' | 'providerData'>>;
}

export async function trustLogin(db: Firestore, decoded: DecodedIdToken, ticket?: string, now = Date.now(), deps: TrustDeps = {}): Promise<boolean> {
  if (needsGoogleCheck(decoded)) return trustGoogleLogin(db, decoded, now, deps);
  if (foreignProvider(decoded)) return false;
  if (!needsTicket(decoded)) return true;
  const authMs = decoded.auth_time * 1000;
  const email = decoded.email;
  const trustRef = db.collection(TRUSTED).doc(trustId(decoded));
  // Sem ticket, ou depois do prazo: vale só se já era confiável (outra aba, navegador sem a marca).
  if (!ticket || !isTicketShape(ticket) || !email || now - authMs > TICKET_TTL_MS) return (await trustRef.get()).exists;
  const ticketRef = db.collection(TICKETS).doc(sha256(ticket));
  return db.runTransaction(async tx => {
    const [t, trust] = await Promise.all([tx.get(ticketRef), tx.get(trustRef)]);
    if (trust.exists) return true;
    if (!t.exists || t.get('emailHash') !== emailHash(email)) return false;
    const issuedAt = t.get('issuedAt') as number;
    // O ticket sai antes do login: até 15 min antes, com folga de 1 min de relógio.
    if (!(issuedAt <= authMs + CLOCK_SKEW_MS && issuedAt >= authMs - TICKET_TTL_MS)) return false;
    tx.delete(ticketRef);
    tx.set(trustRef, { uid: decoded.uid, authTime: decoded.auth_time, at: new Date(now).toISOString() });
    return true;
  });
}

/**
 * Entrada pelo Google: quem tinha só a senha vinculava a própria conta
 * Google à da pessoa (o Firebase deixa, direto pelo navegador) e entrava
 * por ela. Vale se todo Google vinculado tem o e-mail da conta e a conta
 * não mudou fora do site (lib/auth/authStamp.ts).
 */
async function trustGoogleLogin(db: Firestore, decoded: DecodedIdToken, now: number, deps: TrustDeps): Promise<boolean> {
  const trustRef = db.collection(TRUSTED).doc(trustId(decoded));
  if ((await trustRef.get()).exists) return true;
  const user = await deps.getUser?.(decoded.uid).catch(() => null);
  if (!user || !googleMatchesAccount(user)) return false;
  const recorded = (await db.collection('users').doc(user.uid).get()).get('email');
  if ((await checkAuthStamp(db, user, recorded)).status !== 'ok') return false;
  await trustRef.set({ uid: decoded.uid, authTime: decoded.auth_time, at: new Date(now).toISOString(), via: 'google' });
  return true;
}

/** O login deste token é confiável para as rotas sensíveis? */
export async function isTrustedLogin(db: Firestore, decoded: DecodedIdToken): Promise<boolean> {
  if (!needsTrust(decoded)) return true;
  return (await db.collection(TRUSTED).doc(trustId(decoded)).get()).exists;
}

/** Resposta de recusa para rota sensível, ou null para seguir. */
export async function requireTrustedLogin(db: Firestore, decoded: DecodedIdToken): Promise<NextResponse | null> {
  if (await isTrustedLogin(db, decoded)) return null;
  return NextResponse.json(
    { error: 'Por segurança, saia e entre de novo na sua conta para continuar.', code: 'login_check' },
    { status: 403 },
  );
}
