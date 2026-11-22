import { timingSafeEqual } from 'crypto';
import { checkPassword } from '@/lib/validation/password';
import { plural } from '@/lib/plural';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { forgetTrustedLogins, issueLoginTicket } from '@/lib/auth/loginTicket';
import { checkAuthStamp, restampAccount } from '@/lib/auth/authStamp';
import { alertEmailChangedOutside } from '@/lib/auth/accountAlerts';

const verifySchema = z.object({
  email: z.string().email().max(256).toLowerCase(),
  token: z.string().min(20).max(100),
});

const resetSchema = z.object({
  email: z.string().email().max(256).toLowerCase(),
  token: z.string().min(20).max(100),
  newPassword: z.string().min(8).max(128),
});

function sameToken(stored: unknown, given: string): boolean {
  if (typeof stored !== 'string' || stored.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(given));
}

// Verifica token (chamado automaticamente pela página /redefinir-senha ao carregar)
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const ipKey = `reset-verify:${ip}`;
  if (!await rateLimit(ipKey, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = verifySchema.safeParse({
    email: searchParams.get('email') ?? '',
    token: searchParams.get('token') ?? '',
  });
  if (!parsed.success) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });

  const { email, token } = parsed.data;
  const snap = await adminDb.collection('password_resets').doc(email).get();
  if (!snap.exists) return NextResponse.json({ error: 'Link expirado. Solicite um novo.' }, { status: 400 });

  const data = snap.data()!;
  if (Date.now() > data.expiresAt) {
    await snap.ref.delete();
    return NextResponse.json({ error: 'Link expirado. Solicite um novo.' }, { status: 400 });
  }
  // Token errado não apaga mais o link: antes, 10 tentativas com o e-mail
  // de outra pessoa invalidavam o link dela. O token é longo e aleatório, e o
  // limite por IP segura a força bruta.
  if (!sameToken(data.token, token)) {
    await snap.ref.update({ attempts: (data.attempts ?? 0) + 1 });
    return NextResponse.json({ error: 'Link inválido ou já utilizado.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// Redefine senha
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipKey = `reset-password:${ip}`;
  if (!await rateLimit(ipKey, 5, 15 * 60 * 1000)) {
    const wait = Math.ceil(rateLimitRetryAfter(ipKey) / 60000);
    return NextResponse.json({ error: `Aguarde ${plural(wait, 'minuto', 'minutos')}.` }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 }); }

  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const { email, token, newPassword } = parsed.data;
  const ref = adminDb.collection('password_resets').doc(email);
  const snap = await ref.get();

  if (!snap.exists) return NextResponse.json({ error: 'Link expirado. Solicite um novo.' }, { status: 400 });

  const data = snap.data()!;
  if (Date.now() > data.expiresAt) { await ref.delete(); return NextResponse.json({ error: 'Link expirado.' }, { status: 400 }); }
  if (!sameToken(data.token, token)) {
    await ref.update({ attempts: (data.attempts ?? 0) + 1 });
    return NextResponse.json({ error: 'Link inválido ou já utilizado.' }, { status: 400 });
  }

  // Mesmas regras do cadastro (força e senha vazada): antes a troca de
  // senha aceitava qualquer coisa com 8 caracteres.
  const passwordReport = await checkPassword(newPassword, { email });
  if (!passwordReport.ok) {
    return NextResponse.json({ error: passwordReport.error }, { status: 400 });
  }

  try {
    const user = await adminAuth.getUserByEmail(email);
    // E-mail da conta trocado fora do site (lib/auth/authStamp.ts): o link
    // não vale, senão quem trocou o e-mail ficava com a conta.
    const recorded = (await adminDb.collection('users').doc(user.uid).get()).get('email');
    const account = await checkAuthStamp(adminDb, user, recorded);
    if (account.status === 'emailChanged') {
      await ref.delete();
      await alertEmailChangedOutside({ uid: user.uid, email: account.email }, email);
      return NextResponse.json({ error: 'Por segurança, esta conta está travada. Fale com a gente para liberar.', code: 'account_locked' }, { status: 403 });
    }

    // Atualiza senha no Firebase Auth
    await adminAuth.updateUser(user.uid, { password: newPassword });

    // Revoga todos os tokens anteriores, força logout em outras sessões
    await adminAuth.revokeRefreshTokens(user.uid);
    // E no banco, onde as regras não sabem de revogação.
    await forgetTrustedLogins(adminDb, user.uid).catch(err => console.error('[reset-password] logins confiáveis', err));
    // Senha nova pelo site: a marca da conta acompanha.
    await restampAccount(adminDb, adminAuth, user.uid).catch(err => console.error('[reset-password] marca', err));

    // Só carimba a atualização. A senha vive apenas no Firebase Auth.
    await adminDb.collection('users').doc(user.uid).update({ updatedAt: new Date().toISOString() });

    await ref.delete();
    // O navegador entra em seguida com a senha nova.
    const ticket = await issueLoginTicket(adminDb, email).catch(err => { console.error('[reset-password] ticket', err); return undefined; });

    // NÃO usar createCustomToken aqui, exige iam.serviceAccounts.signBlob
    // na service account do Cloud Run, que não funciona de forma estável
    // neste ambiente de Firebase Hosting com webframeworks (ver mesmo
    // aviso em google-verify/route.ts). O login automático é feito pelo
    // client, que já tem a senha nova em mãos (signInWithEmailAndPassword).
    return NextResponse.json(ticket ? { ok: true, ticket } : { ok: true });
  } catch (err) {
    console.error('[reset-password]', err);
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 });
  }
}
