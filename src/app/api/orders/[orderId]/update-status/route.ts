export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { carrierName, trackingUrl as getTrackingUrl } from '@/lib/carriers';
import { sendEmail } from '@/lib/email';
import { formatCurrency } from '@/lib/utils/format';
import { extractBearer } from '@/lib/security';
import type { Order, OrderStatus, User } from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://mikma.com.br';
const STORE = 'Mikma Lençóis';

const ALLOWED: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: 'preparing',
  preparing: 'shipped',
  shipped: 'delivered',
};

// ─── Email helpers ────────────────────────────────────────────────────────────

function wrap(body: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F5F0EB;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0EB;padding:40px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:600px;">

  <tr><td style="padding:0 0 24px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><span style="font-family:Georgia,serif;font-size:22px;color:#1E1208;letter-spacing:.04em;">${STORE}</span></td>
      <td align="right"><span style="font-size:11px;color:#9C8B7C;letter-spacing:.12em;text-transform:uppercase;">Blumenau, SC</span></td>
    </tr></table>
  </td></tr>

  <tr><td style="background:#fff;border-top:3px solid #C4714A;">${body}</td></tr>

  <tr><td style="padding:24px 0 0;">
    <p style="margin:0;font-size:11px;color:#B09C8C;text-align:center;line-height:1.6;">
      Dúvidas? <a href="mailto:contato@mikma.com.br" style="color:#C4714A;text-decoration:none;">contato@mikma.com.br</a>
      &nbsp;·&nbsp;<a href="${BASE_URL}" style="color:#C4714A;text-decoration:none;">mikma.com.br</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function itemsHtml(order: Order) {
  const rows = order.items.map(it => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #F0EBE1;font-size:13px;color:#1E1208;">
        ${it.productName}<br>
        <span style="font-size:11px;color:#9C8B7C;">
          ${it.variant.size}${it.variant.color ? ` · ${it.variant.color}` : ''}
          ${it.variant.fabric ? ` · ${it.variant.fabric}` : ''} · ${it.quantity}x
        </span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #F0EBE1;font-size:13px;color:#1E1208;text-align:right;white-space:nowrap;">
        ${formatCurrency(it.unitPrice * it.quantity)}
      </td>
    </tr>`).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">
    ${rows}
    <tr>
      <td style="padding:12px 0 0;font-size:14px;font-weight:bold;color:#1E1208;">Total</td>
      <td style="padding:12px 0 0;font-size:14px;font-weight:bold;color:#1E1208;text-align:right;">${formatCurrency(order.totalCents)}</td>
    </tr>
  </table>`;
}

function cta(label: string, url: string) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
    <tr><td style="background:#C4714A;">
      <a href="${url}" style="display:inline-block;padding:14px 28px;font-size:13px;font-weight:bold;color:#fff;text-decoration:none;letter-spacing:.04em;">${label}</a>
    </td></tr>
  </table>`;
}

function sig() {
  return `<div style="padding:20px 36px 28px;border-top:1px solid #F0EBE1;">
    <p style="margin:0;font-size:12px;color:#9C8B7C;line-height:1.6;">
      <strong style="color:#1E1208;">${STORE}</strong> · contato@mikma.com.br
    </p>
  </div>`;
}

function buildPreparing(order: Order, name: string) {
  const id = order.id.slice(-8).toUpperCase();
  const url = `${BASE_URL}/pedidos/${order.id}`;
  const html = wrap(`
    <div style="padding:36px 36px 4px;">
      <p style="margin:0 0 4px;font-size:12px;color:#9C8B7C;letter-spacing:.08em;text-transform:uppercase;">Pedido #${id}</p>
      <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:26px;font-weight:normal;color:#1E1208;">Pedido em separação!</h1>
      <p style="margin:0 0 14px;font-size:15px;color:#2C1F14;line-height:1.7;">
        Olá, <strong>${name}</strong>! Nossa equipe já começou a separar e embalar o seu pedido com todo cuidado.
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#705A48;line-height:1.65;">
        Em breve ele estará a caminho. Você receberá um e-mail assim que for despachado.
      </p>
      ${itemsHtml(order)}
      ${cta('Acompanhar pedido', url)}
    </div>
    ${sig()}`);
  return {
    subject: `Pedido #${id} em separação — ${STORE}`,
    html,
    text: `Olá, ${name}! Seu pedido #${id} está sendo separado. Acompanhe em: ${url}`,
  };
}

function buildShipped(order: Order, name: string) {
  const id = order.id.slice(-8).toUpperCase();
  const url = `${BASE_URL}/pedidos/${order.id}`;
  const code = order.delivery?.trackingCode;
  const carrier = order.delivery?.carrier ?? null;
  const rastreioUrl = carrier && code ? getTrackingUrl(carrier, code) : null;
  const carrierLabel = carrier ? carrierName(carrier) : 'transportadora';
  const trackingBlock = code ? `
    <div style="background:#F5F0EB;padding:16px 20px;margin:20px 0;border-left:3px solid #C4714A;">
      <p style="margin:0 0 4px;font-size:11px;color:#9C8B7C;text-transform:uppercase;letter-spacing:.08em;">Código de rastreio · ${carrierLabel}</p>
      <p style="margin:0;font-family:monospace;font-size:18px;font-weight:bold;color:#1E1208;letter-spacing:.12em;">${code}</p>
      ${rastreioUrl ? `<p style="margin:8px 0 0;"><a href="${rastreioUrl}" style="font-size:12px;color:#C4714A;text-decoration:none;">Rastrear na ${carrierLabel}</a></p>` : ''}
    </div>` : '';
  const html = wrap(`
    <div style="padding:36px 36px 4px;">
      <p style="margin:0 0 4px;font-size:12px;color:#9C8B7C;letter-spacing:.08em;text-transform:uppercase;">Pedido #${id}</p>
      <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:26px;font-weight:normal;color:#1E1208;">Pedido despachado!</h1>
      <p style="margin:0 0 14px;font-size:15px;color:#2C1F14;line-height:1.7;">
        Olá, <strong>${name}</strong>! Seu pedido saiu e está a caminho. Fique de olho!
      </p>
      ${trackingBlock}
      ${itemsHtml(order)}
      ${cta('Acompanhar pedido', url)}
    </div>
    ${sig()}`);
  return {
    subject: `Pedido #${id} despachado — ${STORE}`,
    html,
    text: `Olá, ${name}! Pedido #${id} despachado.${code ? ` Rastreio: ${code}` : ''} Veja em: ${url}`,
  };
}

function buildDelivered(order: Order, name: string) {
  const id = order.id.slice(-8).toUpperCase();
  const url = `${BASE_URL}/pedidos/${order.id}`;
  const html = wrap(`
    <div style="padding:36px 36px 4px;">
      <p style="margin:0 0 4px;font-size:12px;color:#9C8B7C;letter-spacing:.08em;text-transform:uppercase;">Pedido #${id}</p>
      <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:26px;font-weight:normal;color:#1E1208;">Pedido entregue!</h1>
      <p style="margin:0 0 14px;font-size:15px;color:#2C1F14;line-height:1.7;">
        Olá, <strong>${name}</strong>! Seu pedido chegou. Esperamos que você ame seus novos lençóis!
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#705A48;line-height:1.65;">
        Qualquer dúvida, é só responder esse e-mail — estamos aqui.
      </p>
      ${itemsHtml(order)}
      ${cta('Ver detalhes do pedido', url)}
    </div>
    ${sig()}`);
  return {
    subject: `Pedido #${id} entregue — ${STORE}`,
    html,
    text: `Olá, ${name}! Pedido #${id} entregue com sucesso. Veja em: ${url}`,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let role: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    // IMPORTANTE: o role vem do custom claim do token (setado via Admin SDK),
    // NUNCA de um campo do Firestore — o próprio usuário pode escrever no
    // próprio documento /users/{uid} (regra allow update: if isSelf(uid)),
    // então ler o role de lá permitiria qualquer comprador se autopromover
    // a seller e alterar status/cancelar pedidos de qualquer cliente.
    role = (decoded as { role?: string }).role ?? '';
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { trackingCode?: string };

  const ref = adminDb.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

  const order = { id: snap.id, ...snap.data() } as Order;
  const next = ALLOWED[order.status];
  if (!next) return NextResponse.json({ error: `Não é possível avançar de "${order.status}"` }, { status: 400 });

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: next,
    updatedAt: FieldValue.serverTimestamp(),
    timeline: FieldValue.arrayUnion({ status: next, at: now }),
  };

  if (next === 'shipped') {
    if (body.trackingCode) update['delivery.trackingCode'] = body.trackingCode;
    update['delivery.dispatchedAt'] = FieldValue.serverTimestamp();
  }
  if (next === 'delivered') {
    update['delivery.deliveredAt'] = FieldValue.serverTimestamp();
  }

  await ref.update(update);

  // Email ao cliente
  let emailError: string | null = null;
  try {
    const uSnap = await adminDb.collection('users').doc(order.userId).get();
    const userData = uSnap.data() as User | undefined;
    const customerEmail = userData?.email;
    const firstName = (userData?.name ?? '').split(' ')[0] || 'cliente';

    if (customerEmail) {
      const updatedOrder: Order = {
        ...order,
        status: next,
        delivery: {
          ...order.delivery,
          ...(next === 'shipped' && body.trackingCode ? { trackingCode: body.trackingCode } : {}),
        },
      };

      const payload =
        next === 'preparing' ? buildPreparing(updatedOrder, firstName) :
        next === 'shipped'   ? buildShipped(updatedOrder, firstName) :
        next === 'delivered' ? buildDelivered(updatedOrder, firstName) : null;

      if (payload) {
        await sendEmail({
          to: customerEmail,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          from: 'noreply',
          replyTo: 'contato@mikma.com.br',
        });
      }
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.error('[update-status] email error:', emailError);
  }

  return NextResponse.json({ ok: true, newStatus: next, emailError });
}
