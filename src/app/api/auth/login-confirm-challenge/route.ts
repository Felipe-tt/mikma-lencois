import { plural } from '@/lib/plural';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { issueChallengeTicket } from '@/lib/auth/loginTicket';
import { checkChallengeLink } from '@/lib/auth/loginChallenge';
import { saveAuthStamp } from '@/lib/auth/authStamp';

const schema = z.object({
  email: z.string().email().max(256).toLowerCase(),
  token: z.string().min(20).max(100),
});

/**
 * "Sim, fui eu", na página do link do e-mail. A página só chama esta rota
 * no clique: abrir o link não confirma (antivírus de e-mail abre links).
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipKey = `login-confirm:${ip}`;
  if (!await rateLimit(ipKey, 10, 15 * 60 * 1000)) {
    const wait = Math.ceil(rateLimitRetryAfter(ipKey) / 60000);
    return NextResponse.json({ error: `Muitas tentativas. Aguarde ${plural(wait, 'minuto', 'minutos')}.` }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });

  const { email, token } = parsed.data;
  const link = await checkChallengeLink(adminDb, email, token);
  if (!link.ok) return link.response;
  const { ref, data } = link;
  if (data.denied === true) {
    return NextResponse.json({ error: 'Esta tentativa foi bloqueada pelo "Não fui eu". Para entrar, faça login de novo.' }, { status: 400 });
  }
  if (data.confirmed === true) return NextResponse.json({ ok: true });

  // Não apaga o desafio: a aba que espera ainda consulta o andamento
  // (login-challenge-status) para saber que pode entrar. O próximo login
  // sobrescreve, e a limpeza diária apaga os antigos (lib/retention.ts).
  await ref.update({ confirmed: true, confirmedAt: new Date().toISOString() });
  // Quem confirmou tem o e-mail da conta: o estado dela agora (por exemplo,
  // a senha trocada fora do site) passa a valer (lib/auth/authStamp.ts).
  // Só se o e-mail da conta ainda for este.
  const user = await adminAuth.getUserByEmail(email).catch(() => null);
  if (user && user.email?.toLowerCase() === email) await saveAuthStamp(adminDb, user).catch(err => console.error('[login-confirm] marca', err));
  // A senha foi conferida antes do e-mail sair: a aba que espera (e só ela,
  // que tem o id do desafio) entra e o login vale para a conta.
  if (typeof data.challengeHash === 'string') {
    await issueChallengeTicket(adminDb, email, data.challengeHash).catch(err => console.error('[login-confirm] ticket', err));
  }

  return NextResponse.json({ ok: true });
}
