import { createHash, randomBytes } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

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
 * dona da conta confirmou o próprio login. Google, passkey, convidado e
 * equipe com segunda etapa não precisam: a senha sozinha não entra por eles.
 */

/** Quanto tempo o ticket espera o login acontecer. */
export const TICKET_TTL_MS = 15 * 60 * 1000;
/** Folga de relógio entre o servidor e o Firebase Auth. */
const CLOCK_SKEW_MS = 60 * 1000;
const TRUST_REQUIRED_SINCE = '2026-11-22T03:00:00Z';

/**
 * Logins feitos antes desta trava continuam valendo: ninguém precisa entrar
 * de novo por causa dela. Os testes ponta a ponta antecipam a data
 * (LOGIN_TICKET_SINCE); data inválida volta à padrão, nunca libera tudo.
 */
export function trustRequiredSinceMs(): number {
  const t = Date.parse(process.env.LOGIN_TICKET_SINCE ?? '');
  return Number.isFinite(t) ? t : Date.parse(TRUST_REQUIRED_SINCE);
}

const TICKETS = 'login_tickets';
const TRUSTED = 'trusted_logins';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** O e-mail não fica legível no banco, só o hash. */
const emailHash = (email: string) => sha256(email.trim().toLowerCase());

function trustId(decoded: DecodedIdToken): string {
  return `${decoded.uid}_${decoded.auth_time}`;
}

/** Este login precisou passar pela checagem do site para ser confiável? */
export function needsTicket(decoded: DecodedIdToken): boolean {
  const fb = decoded.firebase as { sign_in_provider?: string; sign_in_second_factor?: string } | undefined;
  if (fb?.sign_in_provider !== 'password' || fb.sign_in_second_factor) return false;
  return decoded.auth_time * 1000 >= trustRequiredSinceMs();
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
export async function trustLogin(db: Firestore, decoded: DecodedIdToken, ticket?: string, now = Date.now()): Promise<boolean> {
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

/** O login deste token é confiável para as rotas sensíveis? */
export async function isTrustedLogin(db: Firestore, decoded: DecodedIdToken): Promise<boolean> {
  if (!needsTicket(decoded)) return true;
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
