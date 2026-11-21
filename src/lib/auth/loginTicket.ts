import { createHash } from 'node:crypto';
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
 * Por isso as rotas mais sensíveis (CPF e telefone, exportar e apagar a
 * conta) só aceitam login com senha que passou pela checagem. A checagem
 * deixa um ticket para o e-mail; logo depois de entrar, o navegador troca o
 * ticket por "este login é confiável" (/api/auth/trust). Google, passkey,
 * convidado e equipe com segunda etapa não precisam: a senha sozinha não
 * entra por eles.
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

/** O e-mail não fica legível no banco, só o hash. */
function ticketId(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

function trustId(decoded: DecodedIdToken): string {
  return `${decoded.uid}_${decoded.auth_time}`;
}

/** Este login precisou passar pela checagem do site para ser confiável? */
export function needsTicket(decoded: DecodedIdToken): boolean {
  const fb = decoded.firebase as { sign_in_provider?: string; sign_in_second_factor?: string } | undefined;
  if (fb?.sign_in_provider !== 'password' || fb.sign_in_second_factor) return false;
  return decoded.auth_time * 1000 >= trustRequiredSinceMs();
}

/**
 * A checagem do site aprovou um login com senha (senha conferida no
 * servidor, confirmação por e-mail, cadastro ou senha nova). Guarda até 5
 * tickets recentes por e-mail: dois aparelhos entrando juntos não se atrapalham.
 */
export async function issueLoginTicket(db: Firestore, email: string, now = Date.now()): Promise<void> {
  const ref = db.collection(TICKETS).doc(ticketId(email));
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const issued = ((snap.get('issued') as number[] | undefined) ?? []).filter(t => now - t < TICKET_TTL_MS).slice(-4);
    issued.push(now);
    tx.set(ref, { issued, expiresAt: new Date(now + TICKET_TTL_MS).toISOString() });
  });
}

/**
 * Logo depois de entrar: troca um ticket do e-mail, emitido antes do login,
 * por "este login é confiável". O ticket é gasto, então não vale para um
 * segundo login. Devolve se o login ficou confiável.
 */
export async function trustLogin(db: Firestore, decoded: DecodedIdToken, now = Date.now()): Promise<boolean> {
  if (!needsTicket(decoded)) return true;
  const authMs = decoded.auth_time * 1000;
  const email = decoded.email;
  if (!email || now - authMs > TICKET_TTL_MS) return false;
  const ticketRef = db.collection(TICKETS).doc(ticketId(email));
  const trustRef = db.collection(TRUSTED).doc(trustId(decoded));
  return db.runTransaction(async tx => {
    const [ticket, trust] = await Promise.all([tx.get(ticketRef), tx.get(trustRef)]);
    if (trust.exists) return true;
    const issued = (ticket.get('issued') as number[] | undefined) ?? [];
    const match = issued.find(t => t <= authMs + CLOCK_SKEW_MS && t >= authMs - TICKET_TTL_MS);
    if (match === undefined) return false;
    tx.set(ticketRef, { issued: issued.filter(t => t !== match) }, { merge: true });
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
