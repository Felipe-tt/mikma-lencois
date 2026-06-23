export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests } from '@/lib/security';

interface ResendInboundEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    text?: string;
    html?: string;
  };
}

function extractEmail(raw: string): string {
  // "Nome Sobrenome <email@dominio.com>" → "email@dominio.com"
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

function extractName(raw: string): string | undefined {
  const match = raw.match(/^([^<]+)</);
  const name = match?.[1]?.trim();
  return name && name.length > 0 ? name : undefined;
}

/** ID de documento estável a partir do e-mail do cliente (Firestore não aceita "/" em IDs). */
function conversationIdFor(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9.@_-]/g, '_');
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`email-inbound:${ip}`, 30, 60_000)) {
    return tooManyRequests(rateLimitRetryAfter(`email-inbound:${ip}`));
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET não configurada — webhook rejeitado');
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 500 });
  }

  // A verificação de assinatura exige o corpo BRUTO da requisição — nada
  // de req.json() antes disso, ou a assinatura não vai bater.
  const rawBody = await req.text();
  const svixHeaders = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };

  let event: ResendInboundEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, svixHeaders) as ResendInboundEvent;
  } catch {
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 400 });
  }

  if (event.type !== 'email.received') {
    // Outros eventos (sent/delivered/bounced) não nos interessam aqui.
    return NextResponse.json({ ok: true });
  }

  const { from, subject, text, html, email_id } = event.data;
  if (!from) {
    return NextResponse.json({ error: 'Payload sem remetente' }, { status: 400 });
  }

  const customerEmail = extractEmail(from);
  const customerName = extractName(from);
  const now = new Date().toISOString();
  const preview = (text ?? '').slice(0, 140);

  const convId = conversationIdFor(customerEmail);
  const convRef = adminDb.collection('conversations').doc(convId);

  try {
    await adminDb.runTransaction(async tx => {
      const snap = await tx.get(convRef);
      tx.set(
        convRef,
        {
          customerEmail,
          ...(customerName ? { customerName } : {}),
          lastMessagePreview: preview,
          lastMessageAt: now,
          unread: true,
          messageCount: FieldValue.increment(1),
          ...(snap.exists ? {} : { createdAt: now }),
        },
        { merge: true }
      );

      const msgRef = email_id ? convRef.collection('messages').doc(email_id) : convRef.collection('messages').doc();
      tx.set(msgRef, {
        direction: 'inbound',
        from: customerEmail,
        to: process.env.EMAIL_CONTATO_ADDRESS || 'contato@mikma.com.br',
        subject: subject ?? '(sem assunto)',
        text: text ?? '',
        ...(html ? { html } : {}),
        createdAt: now,
      });
    });
  } catch (err) {
    console.error('Erro ao salvar e-mail inbound:', err);
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
