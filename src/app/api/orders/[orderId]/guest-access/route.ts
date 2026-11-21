import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests } from '@/lib/security';
import { sendEmail } from '@/lib/email';
import { BASE_URL, CONTACT_EMAIL } from '@/lib/email/layout';
import { buildGuestAccess } from '@/lib/email/orderStatusEmails';
import { guestAccessToken } from '@/lib/guestAccess';

const HOUR = 60 * 60 * 1000;

/**
 * "Comprei sem cadastro": manda para o e-mail da compra o link que abre o
 * pedido neste aparelho (lib/guestAccess.ts). A resposta é sempre a mesma:
 * não diz se o pedido existe, de quem é nem qual o e-mail.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const ip = getClientIp(req);
  const ipKey = `guest-access:ip:${ip}`;
  if (!await rateLimit(ipKey, 5, HOUR)) return tooManyRequests(rateLimitRetryAfter(ipKey));
  const done = NextResponse.json({ ok: true });
  if (!/^ord_[a-f0-9]{16}$/.test(orderId)) return done;
  // Um link por vez para o mesmo pedido: ninguém enche a caixa de alguém.
  if (!await rateLimit(`guest-access:order:${orderId}`, 3, HOUR)) return done;

  const uid = (await adminDb.collection('orders').doc(orderId).get()).get('userId');
  if (typeof uid !== 'string' || !uid) return done;
  // Conta de verdade entra com a senha (ou o Google, ou a passkey).
  const owner = await adminAuth.getUser(uid).catch(() => null);
  if (!owner || owner.disabled || owner.email || owner.providerData.length > 0) return done;
  const email = (await adminDb.collection('users').doc(uid).get()).get('email');
  if (typeof email !== 'string' || !email.includes('@')) return done;

  const payload = buildGuestAccess(orderId, `${BASE_URL}/pedidos/${orderId}?acesso=${guestAccessToken(orderId, uid)}`);
  await sendEmail({ to: email, subject: payload.subject, text: payload.text, html: payload.html, from: 'noreply', replyTo: CONTACT_EMAIL })
    .catch(err => console.error('[guest-access] e-mail do link falhou:', err));
  return done;
}
