import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Marca da conta no Firebase Auth (auth_stamps/{uid}, só o servidor lê).
 *
 * O Firebase deixa quem entrou com a senha trocar a senha e o e-mail da
 * conta direto, com a chave pública do site. Quem tinha a senha vazada
 * trocava por uma nova (fora de qualquer vazamento), entrava pelo site com
 * ela, passava pela checagem e ganhava login confiável; a dona da conta nem
 * ficava sabendo.
 *
 * O site só troca a senha pelo "esqueci minha senha" e nunca troca o
 * e-mail. O Firebase atualiza tokensValidAfterTime em toda mudança grande
 * da conta (senha, e-mail, sessões encerradas), e o site grava a marca a
 * cada mudança que ele mesmo faz. No login, a marca diferente quer dizer
 * que a conta mudou por fora:
 * - senha (ou sessões): a entrada pede confirmação pelo e-mail da conta;
 * - e-mail: não entra nem recebe senha nova, e o e-mail antigo é avisado.
 */
const STAMPS = 'auth_stamps';

export type StampCheck =
  | { status: 'ok' }
  /** Senha trocada (ou sessões encerradas) fora do site. */
  | { status: 'changed'; email: string }
  /** E-mail trocado fora do site; `email` é o de antes, o que vale. */
  | { status: 'emailChanged'; email: string };

type Account = Pick<UserRecord, 'uid' | 'email' | 'tokensValidAfterTime'>;

const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const timeOf = (v: unknown) => Date.parse(typeof v === 'string' ? v : '') || 0;

export async function saveAuthStamp(db: Firestore, user: Account): Promise<void> {
  await db.collection(STAMPS).doc(user.uid).set({
    email: lower(user.email),
    validAfter: user.tokensValidAfterTime ?? '',
    at: new Date().toISOString(),
  });
}

/**
 * Confere a conta contra a marca. Conta sem marca (de antes dela) ganha a
 * marca agora; o e-mail de referência é o do cadastro (users/{uid}.email,
 * gravado pelo servidor), quando houver.
 */
export async function checkAuthStamp(db: Firestore, user: Account, emailOnRecord?: unknown): Promise<StampCheck> {
  const snap = await db.collection(STAMPS).doc(user.uid).get();
  const email = lower(user.email);
  if (!snap.exists) {
    const recorded = lower(emailOnRecord);
    if (recorded && recorded !== email) return { status: 'emailChanged', email: recorded };
    await saveAuthStamp(db, user);
    return { status: 'ok' };
  }
  const stampEmail = lower(snap.get('email'));
  if (stampEmail && stampEmail !== email) return { status: 'emailChanged', email: stampEmail };
  if (timeOf(user.tokensValidAfterTime) > timeOf(snap.get('validAfter'))) return { status: 'changed', email: stampEmail || email };
  return { status: 'ok' };
}

/** Confere a conta deste e-mail (null se não existir ou não der para ler agora). */
export async function checkAccountByEmail(db: Firestore, auth: Auth, email: string): Promise<(StampCheck & { uid: string }) | null> {
  const user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) return null;
  const recorded = (await db.collection('users').doc(user.uid).get()).get('email');
  return { ...(await checkAuthStamp(db, user, recorded)), uid: user.uid };
}

/** Depois de uma mudança feita pelo próprio site (senha nova, sair de todos os aparelhos). */
export async function restampAccount(db: Firestore, auth: Auth, uid: string): Promise<void> {
  await saveAuthStamp(db, await auth.getUser(uid));
}

export async function forgetAuthStamp(db: Firestore, uid: string): Promise<void> {
  await db.collection(STAMPS).doc(uid).delete();
}
