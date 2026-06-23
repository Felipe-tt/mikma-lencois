import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuth, safeJson, getClientIp, tooManyRequests } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { sendEmail, emailEnabled } from '@/lib/email';

const bodySchema = z.object({
  conversationId: z.string().min(1).max(300),
  text: z.string().min(1).max(10_000),
  subject: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`email-send:${ip}`, 20, 60_000)) {
    return tooManyRequests(rateLimitRetryAfter(`email-send:${ip}`));
  }

  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  if (!emailEnabled()) {
    return NextResponse.json({ error: 'Envio de e-mail não configurado (RESEND_API_KEY ausente)' }, { status: 500 });
  }

  const parsedBody = await safeJson(req, 16_384);
  if (!parsedBody.ok) return parsedBody.response;

  const result = bodySchema.safeParse(parsedBody.data);
  if (!result.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: result.error.flatten() }, { status: 400 });
  }
  const { conversationId, text, subject } = result.data;

  const convRef = adminDb.collection('conversations').doc(conversationId);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
  }
  const conv = convSnap.data() as { customerEmail: string };

  const finalSubject = subject || `Re: contato Mikma Lençóis`;
  const now = new Date().toISOString();

  try {
    await sendEmail({
      to: conv.customerEmail,
      from: 'contato',
      subject: finalSubject,
      text,
      replyTo: process.env.EMAIL_CONTATO_ADDRESS || 'contato@mikma.com.br',
    });
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
    return NextResponse.json({ error: 'Falha ao enviar o e-mail' }, { status: 502 });
  }

  await convRef.collection('messages').add({
    direction: 'outbound',
    from: process.env.EMAIL_CONTATO_ADDRESS || 'contato@mikma.com.br',
    to: conv.customerEmail,
    subject: finalSubject,
    text,
    createdAt: now,
    sentBy: auth.decoded.uid,
  });

  await convRef.set(
    {
      lastMessagePreview: text.slice(0, 140),
      lastMessageAt: now,
      unread: false,
      messageCount: FieldValue.increment(1),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}
