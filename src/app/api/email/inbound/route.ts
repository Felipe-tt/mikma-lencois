import { NextRequest, NextResponse } from 'next/server';
import { conversationIdFor } from '@/lib/email/conversationId';
import { emailFromHeader, nameFromHeader } from '@/lib/email/address';
import { stripQuotedHtml } from '@/lib/email/stripQuoted';
import { Webhook } from 'svix';
import { Resend } from 'resend';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { privateFileMetadata } from '@/lib/storageFiles';
import { isInlineImage } from '@/lib/email/attachments';
import { sanitizeInboundHtml } from '@/lib/email/sanitize';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests } from '@/lib/security';
import { z } from 'zod';
import { resendEventSchema } from './schema';

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

const extractEmail = emailFromHeader;
const extractName = nameFromHeader;

const REPORT_ADDRESS = 'relatorios@mikma.com.br';
function isReportAddress(raw: string): boolean {
  return extractEmail(raw) === REPORT_ADDRESS;
}


/** Anexo maior que isso não é guardado (e-mail de atendimento não precisa). */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/**
 * Baixa um attachment via download_url do Resend e salva no Firebase Storage.
 * Necessário porque as URLs do Resend expiram; o Storage é permanente.
 * Privado: só a equipe abre, pelo painel (storage.rules). Antes cada anexo
 * ficava público no bucket. Fora imagem comum, o navegador baixa em vez de
 * abrir (um HTML anexado não roda como página). Devolve o caminho no Storage.
 */
async function uploadToStorage(
  downloadUrl: string,
  filename: string,
  contentType: string,
  emailId: string,
): Promise<{ path: string; inline: boolean }> {
  const res = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Falha ao baixar anexo ${filename}: ${res.status}`);
  if (Number(res.headers.get('content-length') ?? 0) > MAX_ATTACHMENT_BYTES) throw new Error(`Anexo grande demais: ${filename}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw new Error(`Anexo grande demais: ${filename}`);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const path = `email-attachments/${emailId.replace(/[^\w-]/g, '_')}/${Date.now()}_${safeName}`;
  const inline = isInlineImage(contentType);
  await adminStorage.bucket().file(path).save(buffer, {
    metadata: {
      contentType,
      ...(inline ? {} : { contentDisposition: `attachment; filename="${safeName}"` }),
      metadata: privateFileMetadata(),
    },
  });
  return { path, inline };
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!await rateLimit(`email-inbound:${ip}`, 30, 60_000)) {
    return tooManyRequests(rateLimitRetryAfter(`email-inbound:${ip}`));
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET não configurada');
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 500 });
  }

  // Assinatura exige body BRUTO, não pode usar req.json() antes disso
  const rawBody = await req.text();
  const svixHeaders = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };

  let event: ResendInboundEvent;
  try {
    // verify lança se a assinatura não bate. No svix 2 ele não devolve mais
    // o corpo, então o evento é lido do texto original já conferido.
    new Webhook(secret).verify(rawBody, svixHeaders);
    event = resendEventSchema.parse(JSON.parse(rawBody)) as ResendInboundEvent;
  } catch {
    return NextResponse.json({ error: 'Assinatura ou payload inválido' }, { status: 400 });
  }

  if (event.type !== 'email.received') {
    return NextResponse.json({ ok: true });
  }

  const { from, email_id } = event.data;
  if (!from || !email_id) {
    return NextResponse.json({ error: 'Payload incompleto' }, { status: 400 });
  }

  // Relatórios automáticos de TLS (TLS-RPT, ver dominio-seguranca.yml):
  // não são conversa com cliente, então nem buscam o conteúdo nem gravam.
  if (event.data.to.length > 0 && event.data.to.every(isReportAddress)) {
    return NextResponse.json({ ok: true, ignored: 'report' });
  }

  // ── 1. Busca conteúdo completo (webhook só traz metadados) ─────────────────
  // html_format=data_uri (padrão): imagens inline já vêm como base64 no HTML
  // Não precisa substituir CIDs, Resend já faz isso por nós
  const resendAny = getResend() as AnyResend;
  const { data: fullEmail, error: fetchErr } = await resendAny.emails.receiving.get(email_id);
  if (fetchErr || !fullEmail) {
    console.error('Erro ao buscar e-mail completo:', fetchErr);
    return NextResponse.json({ error: 'Erro ao buscar conteúdo do e-mail' }, { status: 500 });
  }

  const rawText: string = fullEmail.text ?? '';
  const rawHtml: string = fullEmail.html ?? '';
  const subject: string = fullEmail.subject ?? event.data.subject ?? '(sem assunto)';

  // ── Remove o histórico citado (quoted reply) ────────────────────────────────
  // Clientes de email incluem o thread completo na resposta. Isolamos só a
  // parte nova antes do quote para exibir algo limpo no painel.

  /**
   * Text: remove tudo a partir de linhas com padrões típicos de quote/header:
   *   "Em [data], [nome] escreveu:"  (Gmail pt-BR)
   *   "On [date], [name] wrote:"     (Gmail en)
   *   "De: " / "From: "             (Outlook forward header)
   *   Linhas que começam com ">"    (quote puro)
   */
  function stripQuotedText(t: string): string {
    const lines = t.split('\n');
    const cutPatterns = [
      /^>+\s?/,                                             // > quoted line
      /^-{3,}\s*(original message|mensagem original)/i,    // --- Original Message ---
      /^On .+wrote:$/i,                                     // On date, X wrote:
      /^Em .+escreveu:$/i,                                  // Em data, X escreveu:
      /^De:\s+/i,                                           // De: (Outlook header)
      /^From:\s+/i,                                         // From:
      /^Enviado:\s+/i,                                      // Enviado: (Outlook)
      /^Sent:\s+/i,                                         // Sent:
    ];
    // Encontra a primeira linha que é claramente um delimitador de quote
    let cutAt = lines.length;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (cutPatterns.some(p => p.test(line))) {
        // Padrão de "Em... escreveu:" pode ser multi-linha, olha linha anterior
        cutAt = i === 0 ? 0 : i;
        break;
      }
    }
    return lines.slice(0, cutAt).join('\n').trim();
  }

  // HTML: o histórico citado sai em lib/email/stripQuoted.ts (sem regex no corpo).
  // Teto de tamanho: o documento do Firestore aceita até 1 MB, e uma imagem
  // colada no corpo (data:) passava disso; a gravação falhava e a mensagem
  // se perdia. Grande demais, fica só o texto.
  const text: string = stripQuotedText(rawText).slice(0, 100_000);
  const strippedHtml = rawHtml ? stripQuotedHtml(rawHtml) : '';
  const sanitized = strippedHtml ? sanitizeInboundHtml(strippedHtml) : '';
  const html = sanitized.length <= 600_000 ? sanitized : '';

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
  const savedAttachments: { filename: string; contentType: string; path: string; isImage: boolean }[] = [];

  // Filtra imagens inline, já estão embutidas no HTML como data URIs, não precisa salvar separado
  const nonInlineAttachments = attachmentsMeta.filter(
    att => !(att.content_id && rawHtml.includes(`data:${att.content_type}`))
  );

  await Promise.all(
    nonInlineAttachments.map(async att => {
      if (!att.download_url) return;
      try {
        const saved = await uploadToStorage(att.download_url, att.filename, att.content_type, email_id);
        savedAttachments.push({
          filename: att.filename,
          contentType: att.content_type,
          path: saved.path,
          isImage: saved.inline,
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
  // Preview usa o texto limpo (sem quote), se vazio (só citação), usa assunto
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
