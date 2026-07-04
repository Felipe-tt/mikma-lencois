export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';
import { timingSafeEqual } from 'crypto';

// ── Timings ────────────────────────────────────────────────────────────────────
// Pedido sem pagamento por WARN_AFTER_MS → envia aviso "vai cancelar em 24h"
// Pedido sem pagamento por CANCEL_AFTER_MS → cancela e envia e-mail de cancelamento
const WARN_AFTER_MS   = 24 * 60 * 60 * 1000; // 24h
const CANCEL_AFTER_MS = 48 * 60 * 60 * 1000; // 48h

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mikma.com.br';

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function emailHtml({
  title,
  preheader,
  body,
  ctaText,
  ctaUrl,
}: {
  title: string;
  preheader: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <!-- preheader hidden -->
  <div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;">

        <!-- Header -->
        <tr><td style="padding:0 0 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:normal;color:#1E1208;letter-spacing:0.04em;">
                  Mikma Lençóis
                </span>
              </td>
              <td align="right">
                <span style="font-size:10px;color:#B09C8C;letter-spacing:0.15em;text-transform:uppercase;">
                  Blumenau, SC
                </span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:36px;border-top:3px solid #C4714A;">
          ${body}
          ${ctaText && ctaUrl ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
            <tr><td align="center">
              <a href="${ctaUrl}"
                 style="display:inline-block;background:#1E1208;color:#FAF8F5;font-family:Georgia,serif;font-size:14px;text-decoration:none;padding:14px 36px;letter-spacing:0.04em;">
                ${ctaText}
              </a>
            </td></tr>
          </table>` : ''}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 0 0;">
          <p style="margin:0;font-size:11px;color:#B09C8C;text-align:center;line-height:1.7;">
            Dúvidas? Responda este e-mail ou acesse
            <a href="${APP_URL}" style="color:#C4714A;text-decoration:none;">mikma.com.br</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  // Autenticação via secret compartilhado (comparação timing-safe)
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  const isValid = !!secret && !!expected && secret.length === expected.length
    && timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const warnCutoff   = new Date(now - WARN_AFTER_MS);
  const cancelCutoff = new Date(now - CANCEL_AFTER_MS);

  const results = { warned: 0, cancelled: 0, errors: 0 };

  // ── Busca todos os pedidos ainda pending_payment ───────────────────────────
  const snap = await adminDb
    .collection('orders')
    .where('status', '==', 'pending_payment')
    .get();

  for (const doc of snap.docs) {
    const order = doc.data();
    const orderId = doc.id;
    const createdAt: Date = order.createdAt?.toDate?.() ?? new Date(order.createdAt);

    try {
      // ── Busca e-mail do cliente ─────────────────────────────────────────
      let customerEmail: string | undefined;
      let customerName = 'Cliente';

      const userSnap = await adminDb.collection('users').doc(order.userId as string).get();
      const userData = userSnap.data() ?? {};
      customerEmail = userData.email as string | undefined;
      customerName  = (userData.name ?? userData.displayName ?? 'Cliente') as string;

      if (!customerEmail) {
        try {
          const authUser = await adminAuth.getUser(order.userId as string);
          customerEmail = authUser.email;
        } catch {
          // sem email — pula
        }
      }

      const shortId  = orderId.slice(-8).toUpperCase();
      const orderUrl = `${APP_URL}/pedidos/${orderId}`;
      const total    = formatCurrency(order.totalCents as number);

      // ── CANCELAR: pedido criado há mais de 48h ─────────────────────────
      if (createdAt < cancelCutoff) {
        const ref = adminDb.collection('orders').doc(orderId);
        const nowIso = new Date().toISOString();

        // Usa transação para reler o status no momento da escrita: o
        // snapshot do início do cron (linha ~107) pode estar desatualizado
        // se o webhook de pagamento confirmou esse pedido enquanto o loop
        // processava outros pedidos antes deste (cada iteração faz fetch
        // de usuário + envio de e-mail, então a janela entre ler e
        // escrever não é instantânea). Sem reler dentro da transação, um
        // pedido pago no meio dessa janela seria marcado 'cancelled' por
        // cima do 'paid', e reserved seria decrementado duas vezes
        // (uma em confirmOrder no webhook, outra aqui).
        const wasCancelled = await adminDb.runTransaction(async (tx) => {
          const freshSnap = await tx.get(ref);
          if (!freshSnap.exists) return false;
          const freshOrder = freshSnap.data()!;
          if (freshOrder.status !== 'pending_payment') {
            // Mudou de status (pago, já cancelado, etc.) entre a leitura
            // inicial do cron e agora — não mexe em nada.
            return false;
          }

          tx.update(ref, {
            status: 'cancelled',
            cancelledAt: nowIso,
            cancelledBy: 'cron',
            updatedAt: FieldValue.serverTimestamp(),
            timeline: FieldValue.arrayUnion({
              status: 'cancelled',
              at: nowIso,
              note: 'Cancelado automaticamente por falta de pagamento após 48h',
            }),
          });
          return true;
        });

        if (!wasCancelled) {
          // Pedido já tinha saído de pending_payment (provavelmente pago
          // pelo webhook) — pula o e-mail de cancelamento e a liberação
          // de estoque, que já foram tratados em outro lugar.
          continue;
        }

        // Libera reserva de estoque
        const items = (order.items ?? []) as Array<{ sku: string; quantity: number }>;
        for (const item of items) {
          const invSnap = await adminDb
            .collection('inventory')
            .where('sku', '==', item.sku)
            .limit(1)
            .get();
          if (!invSnap.empty) {
            adminDb.collection('inventory').doc(invSnap.docs[0].id).update({
              reserved: FieldValue.increment(-item.quantity),
              updatedAt: FieldValue.serverTimestamp(),
            }).catch(() => {});
          }
        }

        results.cancelled++;

        // E-mail de cancelamento
        if (customerEmail) {
          await sendEmail({
            to: customerEmail,
            subject: `Pedido #${shortId} cancelado — Mikma Lençóis`,
            text: [
              `Olá, ${customerName}.`,
              '',
              `Seu pedido #${shortId} (${total}) foi cancelado por falta de pagamento.`,
              '',
              'Como o pagamento não foi realizado em 48 horas, cancelamos automaticamente para liberar os itens.',
              '',
              `Se quiser, acesse ${APP_URL}/produtos e faça um novo pedido.`,
              '',
              '— Mikma Lençóis',
            ].join('\n'),
            html: emailHtml({
              title: `Pedido #${shortId} cancelado`,
              preheader: `Seu pedido #${shortId} foi cancelado por falta de pagamento.`,
              body: `
                <p style="margin:0 0 6px;font-size:18px;font-weight:bold;color:#1E1208;">Pedido cancelado</p>
                <p style="margin:0 0 24px;font-size:14px;color:#705A48;line-height:1.65;">
                  Olá, ${customerName}. Como o pagamento do pedido <strong>#${shortId}</strong> (${total})
                  não foi realizado em 48 horas, ele foi cancelado automaticamente.
                </p>
                <p style="margin:0;font-size:14px;color:#705A48;line-height:1.65;">
                  Os itens foram liberados para outros clientes. Se ainda quiser comprar,
                  basta fazer um novo pedido — estaremos esperando.
                </p>
              `,
              ctaText: 'Ver produtos',
              ctaUrl: `${APP_URL}/produtos`,
            }),
          }).catch(() => {});
        }

        continue; // já cancelou — não precisa checar o aviso
      }

      // ── AVISAR: pedido criado há mais de 24h mas ainda não avisado ─────
      if (createdAt < warnCutoff && !order.cancellationWarningSentAt) {
        await adminDb.collection('orders').doc(orderId).update({
          cancellationWarningSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        results.warned++;

        if (customerEmail) {
          await sendEmail({
            to: customerEmail,
            subject: `Seu pedido #${shortId} vai ser cancelado em 24h — Mikma Lençóis`,
            text: [
              `Olá, ${customerName}.`,
              '',
              `Seu pedido #${shortId} (${total}) ainda está aguardando pagamento.`,
              '',
              'Se o pagamento não for realizado em até 24 horas, ele será cancelado automaticamente.',
              '',
              `Para pagar agora: ${orderUrl}`,
              '',
              '— Mikma Lençóis',
            ].join('\n'),
            html: emailHtml({
              title: `Pedido #${shortId} aguardando pagamento`,
              preheader: `Faltam 24h para o pedido #${shortId} ser cancelado.`,
              body: `
                <p style="margin:0 0 6px;font-size:18px;font-weight:bold;color:#1E1208;">Seu pedido vai expirar</p>
                <p style="margin:0 0 24px;font-size:14px;color:#705A48;line-height:1.65;">
                  Olá, ${customerName}. Seu pedido <strong>#${shortId}</strong> (${total}) ainda
                  está aguardando pagamento.
                </p>
                <p style="margin:0 0 0;font-size:14px;color:#705A48;line-height:1.65;">
                  Se o pagamento não for realizado em <strong>24 horas</strong>, o pedido será
                  cancelado automaticamente e os itens serão liberados.
                </p>
              `,
              ctaText: 'Pagar agora',
              ctaUrl: orderUrl,
            }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error(`[expire-orders] erro no pedido ${orderId}:`, err);
      results.errors++;
    }
  }

  console.log('[expire-orders] resultado:', results);
  return NextResponse.json({ ok: true, ...results });
}
