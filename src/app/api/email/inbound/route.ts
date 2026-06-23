export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { Resend } from 'resend';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests } from '@/lib/security';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

interface ResendInboundEvent {
  type: string;
  created_at: string;
  data: { email_id: string; from: string; to: string[]; subject?: string };
}

type AnyResend = any;

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

/** Remove tags perigosas do HTML antes de salvar/exibir */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Baixa um attachment via download_url do Resend e salva no Firebase Storage.
 * Necessário porque as URLs do Resend expiram; o Storage é permanente.
 */
async function uploadToStorage(
  downloadUrl: string,
  filename: string,
  contentType: string,
  emailId: string,
): Promise<string> {
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Falha ao baixar anexo ${filename}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `email-attachments/${emailId}/${Date.now()}_${safeName}`;
  const file = adminStorage.bucket().file(path);
  await file.save(buffer, { metadata: { contentType } });
  await file.makePublic();
  return `https://storage.googleapis.com/${adminStorage.bucket().name}/${path}`;
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

  // Assinatura exige body BRUTO — não pode usar req.json() antes disso
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

  const { from, email_id } = event.data;
  if (!from || !email_id) {
    return NextResponse.json({ error: 'Payload incompleto' }, { status: 400 });
  }

  // ── 1. Busca conteúdo completo (webhook só traz metadados) ─────────────────
  // html_format=data_uri (padrão): imagens inline já vêm como base64 no HTML
  // Não precisa substituir CIDs — Resend já faz isso por nós
  const resendAny = getResend() as AnyResend;
  const { data: fullEmail, error: fetchErr } = await resendAny.emails.receiving.get(email_id);
  if (fetchErr || !fullEmail) {
    console.error('Erro ao buscar e-mail completo:', fetchErr);
    return NextResponse.json({ error: 'Erro ao buscar conteúdo do e-mail' }, { status: 500 });
  }

  const text: string = fullEmail.text ?? '';
  const rawHtml: string = fullEmail.html ?? '';
  const html = rawHtml ? sanitizeHtml(rawHtml) : '';
  const subject: string = fullEmail.subject ?? event.data.subject ?? '(sem assunto)';

  // ── 2. Busca lista de attachments com download_url ─────────────────────────
  // receiving.get() traz metadados dos attachments mas sem download_url.
  // attachments.list() retorna download_url para cada um.
  const attachmentsMeta: { id: string; filename: string; content_type: string; content_id?: string; download_url?: string }[] = [];

  try {
    const { data: attList } = await resendAny.emails.attachments.list({ emailId: email_id });
    if (Array.isArray(attList?.data)) attachmentsMeta.push(...attList.data);
  } catch (err) {
    console.warn('Falha ao listar attachments:', err);
  }

  // ── 3. Upload de anexos para Firebase Storage (URLs permanentes) ───────────
  const savedAttachments: { filename: string; contentType: string; url: string; isImage: boolean }[] = [];

  // Filtra imagens inline — já estão embutidas no HTML como data URIs, não precisa salvar separado
  const nonInlineAttachments = attachmentsMeta.filter(
    att => !(att.content_id && rawHtml.includes(`data:${att.content_type}`))
  );

  await Promise.all(
    nonInlineAttachments.map(async att => {
      if (!att.download_url) return;
      try {
        const storageUrl = await uploadToStorage(att.download_url, att.filename, att.content_type, email_id);
        savedAttachments.push({
          filename: att.filename,
          contentType: att.content_type,
          url: storageUrl,
          isImage: att.content_type.startsWith('image/'),
        });
      } catch (err) {
        console.warn('Falha ao salvar anexo:', att.filename, err);
      }
    })
  );

  // ── 4. Salva no Firestore ──────────────────────────────────────────────────
  const customerEmail = extractEmail(from);
  const customerName = extractName(from);
  const now = new Date().toISOString();
  const preview = text.trim().slice(0, 140) || subject;

  const convId = conversationIdFor(customerEmail);
  const convRef = adminDb.collection('conversations').doc(convId);

  try {
    await adminDb.runTransaction(async (tx: AnyResend) => {
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
        subject,
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
