export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { syncOrderPayment } from '@/lib/orders/syncPayment';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';
import { timingSafeEqual } from 'crypto';
import { expandStockLines } from '@/lib/orderStockLines';
import { releaseCouponUse } from '@/lib/orders/couponUsage';
import { buildCancelled, buildPaymentReminder } from '@/lib/email/orderStatusEmails';
import { CONTACT_EMAIL, type EmailItem } from '@/lib/email/layout';

// ── Timings ────────────────────────────────────────────────────────────────────
// Pedido sem pagamento por WARN_AFTER_MS → envia aviso "vai cancelar em 24h"
// Pedido sem pagamento por CANCEL_AFTER_MS → cancela e envia e-mail de cancelamento
const WARN_AFTER_MS   = 24 * 60 * 60 * 1000; // 24h
const CANCEL_AFTER_MS = 48 * 60 * 60 * 1000; // 48h

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

  const results = { warned: 0, cancelled: 0, expired: 0, errors: 0 };

  // ── Busca todos os pedidos ainda pending_payment ───────────────────────────
  const snap = await adminDb
    .collection('orders')
    // payment_expired também: o PIX dura 15 min e o webhook transparent.expired
    // muda o pedido pra payment_expired, então sem isso quase nenhum pedido
    // não pago chegava a ser cancelado (ficava parado pra sempre, apesar do
    // e-mail prometer cancelamento em 48h).
    .where('status', 'in', ['pending_payment', 'payment_expired'])
    .get();

  for (const doc of snap.docs) {
    const order = doc.data();
    const orderId = doc.id;
    const createdAt: Date = order.createdAt?.toDate?.() ?? new Date(order.createdAt);

    try {
      // ── Confere na AbacatePay o PIX que já passou do vencimento ────────
      // A v2 não manda mais evento de expiração: sem isto o estoque ficava
      // reservado até o cancelamento de 48h. Pago? confirma. Vencido? expira
      // (libera a reserva). Erro de consulta: segue o fluxo normal.
      const pay = (order.payment ?? {}) as { method?: string; expiresAt?: { toDate?: () => Date } | string };
      const exp = typeof pay.expiresAt === 'string' ? new Date(pay.expiresAt) : pay.expiresAt?.toDate?.();
      if (order.status === 'pending_payment' && exp && exp.getTime() < now - 60_000) {
        const synced = await syncOrderPayment(orderId);
        if (synced === 'paid') continue;
        if (synced === 'expired') results.expired++;
      }

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
          // sem email, pula
        }
      }


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
        // Só pending_payment ainda tem reserva ativa; payment_expired já teve
        // a reserva liberada pelo webhook transparent.expired.
        const cancelResult = await adminDb.runTransaction(async (tx): Promise<false | 'release' | 'no-release'> => {
          const freshSnap = await tx.get(ref);
          if (!freshSnap.exists) return false;
          const freshOrder = freshSnap.data()!;
          if (freshOrder.status !== 'pending_payment' && freshOrder.status !== 'payment_expired') {
            // Mudou de status (pago, já cancelado, etc.) entre a leitura
            // inicial do cron e agora, não mexe em nada.
            return false;
          }

          // Reserva liberada na MESMA transação (antes era um update solto,
          // sem await, que podia se perder quando a instância encerrava).
          const releaseStock = freshOrder.status === 'pending_payment';
          const lines = releaseStock
            ? expandStockLines((freshOrder.items ?? []) as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>)
            : [];
          const invRefs = lines.map(l => adminDb.collection('inventory').doc(l.sku));
          const invSnaps = await Promise.all(invRefs.map(r => tx.get(r)));

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
          for (let i = 0; i < lines.length; i++) {
            if (!invSnaps[i].exists) continue;
            tx.update(invRefs[i], {
              reserved: FieldValue.increment(-lines[i].quantity),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          return releaseStock ? 'release' : 'no-release';
        });

        if (!cancelResult) {
          // Pedido já tinha saído de pending_payment (provavelmente pago
          // pelo webhook), pula o e-mail de cancelamento e a liberação
          // de estoque, que já foram tratados em outro lugar.
          continue;
        }

        await releaseCouponUse(order.couponCode as string | undefined);

        results.cancelled++;

        // E-mail de cancelamento
        if (customerEmail) {
          const payload = buildCancelled(
            { id: orderId, items: (order.items ?? []) as EmailItem[], totalCents: order.totalCents as number, productsCents: order.productsCents as number | undefined, shippingCents: order.shippingCents as number | undefined, pixDiscountCents: order.pixDiscountCents as number | undefined, couponDiscountCents: order.couponDiscountCents as number | undefined, discountCents: order.discountCents as number | undefined, couponCode: order.couponCode as string | undefined },
            customerName.split(' ')[0] || 'cliente',
            { refund: false, reason: 'O pagamento não foi feito em 48 horas, então os itens voltaram para a loja.' },
          );
          await sendEmail({
            to: customerEmail, subject: payload.subject, text: payload.text, html: payload.html,
            from: 'noreply', replyTo: CONTACT_EMAIL,
          }).catch(() => {});
        }

        continue; // já cancelou, não precisa checar o aviso
      }

      // ── AVISAR: pedido criado há mais de 24h mas ainda não avisado ─────
      if (createdAt < warnCutoff && !order.cancellationWarningSentAt) {
        await adminDb.collection('orders').doc(orderId).update({
          cancellationWarningSentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        results.warned++;

        if (customerEmail) {
          const payload = buildPaymentReminder(
            { id: orderId, items: (order.items ?? []) as EmailItem[], totalCents: order.totalCents as number, productsCents: order.productsCents as number | undefined, shippingCents: order.shippingCents as number | undefined, pixDiscountCents: order.pixDiscountCents as number | undefined, couponDiscountCents: order.couponDiscountCents as number | undefined, discountCents: order.discountCents as number | undefined, couponCode: order.couponCode as string | undefined },
            customerName.split(' ')[0] || 'cliente',
          );
          await sendEmail({
            to: customerEmail, subject: payload.subject, text: payload.text, html: payload.html,
            from: 'noreply', replyTo: CONTACT_EMAIL,
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
