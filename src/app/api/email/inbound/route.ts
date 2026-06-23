export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { Resend } from 'resend';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests } from '@/lib/security';

const resend = new Resend(process.env.RESEND_API_KEY);

interface ResendInboundEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    attachments?: { filename: string; content_type: string; download_url: string }[];
  };
}

function extractEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

function extractName(raw: string): string | undefined {
  const match = raw.match(/^([^<]+)</);
  const name = match?.[1]?.trim().replace(/^"|"$/g, '');
  return name && name.length > 0 ? name : undefined;
}

function conversationIdFor(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9.@_-]/g, '_');
}

/** Baixa um attachment do Resend e salva no Firebase Storage. Retorna a URL pública. */
async function uploadAttachmentToStorage(
  downloadUrl: string,
  filename: string,
  contentType: string,
  emailId: string,
): Promise<string> {
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Falha ao baixar anexo: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `email-attachments/${emailId}/${Date.now()}_${safeName}`;
  const file = adminStorage.bucket().file(path);

  await file.save(buffer, { metadata: { contentType } });
  await file.makePublic();

  return `https://storage.googleapis.com/${adminStorage.bucket().name}/${path}`;
}

/** Substitui referências CID (imagens inline) no HTML pelos URLs do Storage. */
function replaceCidReferences(html: string, cidMap: Record<string, string>): string {
  return html.replace(/cid:([^"'\s>]+)/gi, (_, cid) => cidMap[cid] ?? `cid:${cid}`);
}

/** Sanitiza HTML mantendo apenas tags seguras — nada de scripts, iframes, etc. */
function sanitizeHtml(html: string): string {
  // Remove scripts, iframes, objetos, e on* handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`email-inbound:${ip}`, 30, 60_000)) {
    return tooManyRequests(rateLimitRetryAfter(`email-inbound:${ip}`));
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET não configurada');
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 500 });
  }

  // Assinatura exige body BRUTO
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
    return NextResponse.json({ ok: true });
  }

  const { from, subject, email_id } = event.data;
  if (!from || !email_id) {
    return NextResponse.json({ error: 'Payload incompleto' }, { status: 400 });
  }

  // ── 1. Busca conteúdo completo via API (webhook só traz metadados) ──────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fullEmail, error: fetchErr } = await (resend.emails as any).receiving.get(email_id);
  if (fetchErr || !fullEmail) {
    console.error('Erro ao buscar e-mail completo:', fetchErr);
    return NextResponse.json({ error: 'Erro ao buscar conteúdo do e-mail' }, { status: 500 });
  }

  const text: string = fullEmail.text ?? '';
  const rawHtml: string = fullEmail.html ?? '';
  const attachmentsMeta: { filename: string; content_type: string; download_url?: string; id?: string }[] =
    fullEmail.attachments ?? [];

  const customerEmail = extractEmail(from);
  const customerName = extractName(from);
  const now = new Date().toISOString();

  // ── 2. Salva anexos no Storage ──────────────────────────────────────────────
  const savedAttachments: { filename: string; contentType: string; url: string; isImage: boolean }[] = [];
  const cidMap: Record<string, string> = {};

  await Promise.all(
    attachmentsMeta.map(async att => {
      try {
        const dlUrl = att.download_url;
        if (!dlUrl) return;

        const storageUrl = await uploadAttachmentToStorage(dlUrl, att.filename, att.content_type, email_id);
        const isImage = att.content_type.startsWith('image/');

        savedAttachments.push({ filename: att.filename, contentType: att.content_type, url: storageUrl, isImage });

        // Mapeia CID para URLs do Storage (imagens inline no corpo HTML)
        if (isImage && att.id) cidMap[att.id] = storageUrl;
      } catch (err) {
        console.warn('Falha ao salvar anexo:', att.filename, err);
      }
    })
  );

  // ── 3. Processa HTML: substitui CIDs e sanitiza ─────────────────────────────
  const html = rawHtml
    ? sanitizeHtml(replaceCidReferences(rawHtml, cidMap))
    : '';

  // Preview para a lista de conversas
  const preview = text.trim().slice(0, 140) || subject || '(sem conteúdo)';

  // ── 4. Salva no Firestore ───────────────────────────────────────────────────
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

      const msgRef = convRef.collection('messages').doc(email_id);
      tx.set(msgRef, {
        direction: 'inbound',
        from: customerEmail,
        to: process.env.EMAIL_CONTATO_ADDRESS || 'contato@mikma.com.br',
        subject: subject ?? '(sem assunto)',
        text,
        ...(html ? { html } : {}),
        attachments: savedAttachments,
        createdAt: now,
      });
    });
  } catch (err) {
    console.error('Erro ao salvar e-mail inbound:', err);
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
