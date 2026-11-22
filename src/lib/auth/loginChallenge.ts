import { timingSafeEqual } from 'node:crypto';
import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

/**
 * "Não fui eu" vale por 1 dia: a pessoa pode ler o e-mail horas depois e
 * ainda precisa bloquear e trocar a senha. Confirmar o login vale 10 min.
 */
export const DENY_WINDOW_MS = 24 * 60 * 60 * 1000;

type LinkCheck =
  | { ok: true; ref: DocumentReference; data: DocumentData }
  | { ok: false; response: NextResponse };

const fail = (error: string): LinkCheck => ({ ok: false, response: NextResponse.json({ error }, { status: 400 }) });

/**
 * Confere o link do e-mail de confirmação de login (login_challenges/{email}).
 * Token errado só conta a tentativa: apagar o desafio deixava quem soubesse
 * o e-mail invalidar o link da dona da conta. O token é longo e aleatório,
 * e o limite por IP de quem chama segura a força bruta.
 */
export async function checkChallengeLink(
  db: Firestore, email: string, token: string, { validForMs }: { validForMs?: number } = {},
): Promise<LinkCheck> {
  const ref = db.collection('login_challenges').doc(email);
  const snap = await ref.get();
  if (!snap.exists) return fail('Link expirado. Faça login novamente.');
  const data = snap.data()!;
  const expected = Buffer.from(String(data.token ?? ''));
  const given = Buffer.from(token);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await ref.update({ attempts: (data.attempts ?? 0) + 1 });
    return fail('Este link não vale mais. Se pediu outro login, use o e-mail mais recente.');
  }
  const deadline = validForMs === undefined ? Number(data.expiresAt) : Date.parse(String(data.createdAt)) + validForMs;
  if (!(Date.now() <= deadline)) return fail('Link expirado. Faça login novamente.');
  return { ok: true, ref, data };
}
