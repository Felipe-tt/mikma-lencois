import { plural } from '@/lib/plural';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { issueChallengeTicket } from '@/lib/auth/loginTicket';
import { checkChallengeLink } from '@/lib/auth/loginChallenge';

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
  // A senha foi conferida antes do e-mail sair: a aba que espera (e só ela,
  // que tem o id do desafio) entra e o login vale para a conta.
  if (typeof data.challengeHash === 'string') {
    await issueChallengeTicket(adminDb, email, data.challengeHash).catch(err => console.error('[login-confirm] ticket', err));
  }

  return NextResponse.json({ ok: true });
}
