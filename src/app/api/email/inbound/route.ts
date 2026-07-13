export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { Resend } from 'resend';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests } from '@/lib/security';
import { z } from 'zod';


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

import sanitizeHtmlLib from 'sanitize-html';
import { resendEventSchema } from './schema';

/**
 * Remove conteúdo perigoso do HTML de e-mails recebidos antes de salvar e
 * exibir no painel (via dangerouslySetInnerHTML em /painel/mensagens).
 *
 * Esse HTML vem de QUALQUER pessoa que escreva para contato@mikma.com.br —
 * é conteúdo de origem totalmente não confiável. Uma sanitização baseada em
 * regex (substituir <script>, on* etc. manualmente) é conhecidamente
 * contornável (tags malformadas, encodings alternativos, atributos sem
 * aspas...), então usamos uma lib dedicada com allowlist restrita: só as
 * tags e atributos necessários para exibir o corpo de um e-mail formatado,
 * nada que possa executar script ou navegar para fora (sem <a href> com
 * javascript:, sem onXxx, sem <script>/<iframe>/<object>/<style>/<form>).
 */
function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: [
      'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'span', 'div',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'a', 'img',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      // Imagens inline do Resend vêm como data: URI (base64) — restringe
      // ainda mais para apenas esse uso, não libera data: em outras tags
      // (em especial não em <a href>, onde data:text/html poderia abrir
      // uma página com HTML/JS arbitrário disfarçada de link legítimo).
      img: ['http', 'https', 'data'],
    },
    // Remove qualquer CSS que tente navegar/executar via url() perigosa
    allowedStyles: {
      '*': {
        'color': [/^#[0-9a-f]{3,6}$/i, /^rgb/],
        'background-color': [/^#[0-9a-f]{3,6}$/i, /^rgb/],
        'font-weight': [/^(bold|normal|[0-9]+)$/],
        'font-style': [/^italic$/],
        'text-decoration': [/^underline$/],
      },
    },
    // Links sempre abrem em nova aba e sem repassar referrer/opener
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
    disallowedTagsMode: 'discard',
  });
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
    const verified = wh.verify(rawBody, svixHeaders);
    event = resendEventSchema.parse(verified) as ResendInboundEvent;
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

  // ── 1. Busca conteúdo completo (webhook só traz metadados) ─────────────────
  // html_format=data_uri (padrão): imagens inline já vêm como base64 no HTML
  // Não precisa substituir CIDs — Resend já faz isso por nós
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
        // Padrão de "Em... escreveu:" pode ser multi-linha — olha linha anterior
        cutAt = i === 0 ? 0 : i;
        break;
      }
    }
    return lines.slice(0, cutAt).join('\n').trim();
  }

  /**
   * HTML: remove elementos que clientes de email usam para encapsular o thread:
   *   <blockquote>            (Gmail, Apple Mail)
   *   <div class="gmail_quote">
   *   <div id="divRplyFwdMsg"> (Outlook)
   *   <hr> seguido de header   (Outlook)
   * Estratégia: clona o DOM via regex/string, remove os containers de quote e
   * retorna o HTML restante. Não temos DOM no Node, mas podemos usar a lib de
   * sanitização para remover blockquotes e depois limpar.
   */
  function stripQuotedHtml(h: string): string {
    // Remove blocos de quote: <blockquote ...>...</blockquote>
    let stripped = h.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '');

    // Gmail: <div class="gmail_quote ...">...</div>
    stripped = stripped.replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*?<\/div>/gi, '');

    // Outlook: <div id="divRplyFwdMsg">...</div>
    stripped = stripped.replace(/<div[^>]*id="divRplyFwdMsg"[\s\S]*?<\/div>/gi, '');

    // Outlook: <div id="appendonsend">...</div>
    stripped = stripped.replace(/<div[^>]*id="appendonsend"[\s\S]*?<\/div>/gi, '');

    // Remove qualquer <hr> isolado que geralmente separa o histórico
    stripped = stripped.replace(/<hr[^>]*>/gi, '');

    // Remove estilos externos que clientes de email injetam (resets, fonts)
    stripped = stripped.replace(/<style[\s\S]*?<\/style>/gi, '');

    // Limpa espaço em branco resultante de tags removidas
    stripped = stripped.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');

    return stripped.trim();
  }

  const text: string = stripQuotedText(rawText);
  const strippedHtml = rawHtml ? stripQuotedHtml(rawHtml) : '';
  const html = strippedHtml ? sanitizeHtml(strippedHtml) : '';

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
  // Preview usa o texto limpo (sem quote) — se vazio (só citação), usa assunto
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
