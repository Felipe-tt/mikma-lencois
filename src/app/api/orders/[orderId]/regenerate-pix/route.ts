import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { extractBearer, getClientIp, tooManyRequests } from '@/lib/security';
import { sanitizePixDescription } from '@/lib/abacatepay';
import { expandStockLines } from '@/lib/orderStockLines';
import { StockError } from '@/lib/errors';

/** Mesmo prazo do cron expire-orders: depois disso o pedido é cancelado. */
const ORDER_PAYMENT_WINDOW_MS = 48 * 60 * 60 * 1000;

type StockItem = { productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number };

const ABACATEPAY_BASE = 'https://api.abacatepay.com/v2';

async function createPixWithRetry(call: () => Promise<Response>): Promise<Response> {
  try {
    const res = await call();
    if (res.status < 500 && res.status !== 429) return res;
  } catch { /* timeout/rede: tenta de novo abaixo */ }
  await new Promise(r => setTimeout(r, 800));
  // Segunda falha de rede vira resposta de erro: quem chama já sabe desfazer
  // o pedido (liberar estoque e cupom) em vez de deixar tudo reservado.
  return call().catch(() => new Response(JSON.stringify({ error: 'timeout' }), { status: 504 }));
}
// Ver nota em create-pix/route.ts: ambiente é decidido por qual key é
// usada. Precisa usar a MESMA que gerou o pedido original — regenerar
// um PIX de teste com a key de produção (ou vice-versa) criaria uma
// cobrança no ambiente errado, e o webhook de confirmação nunca bateria
// (o txId novo pertenceria a um ambiente diferente do resto do pedido).
function abacatePayKey(sandbox: boolean): string {
  return (sandbox ? process.env.ABACATEPAY_SANDBOX_API_KEY : process.env.ABACATEPAY_API_KEY) ?? '';
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const ip = getClientIp(req);
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  // Dual rate limit: por IP e por usuário (mais restrito)
  const ipKey  = `regen-pix:ip:${ip}`;
  const uidKey = `regen-pix:uid:${uid}`;
  if (!await rateLimit(ipKey, 20, 60 * 60 * 1000) || !await rateLimit(uidKey, 5, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(uidKey));
  }

  const ref   = adminDb.collection('orders').doc(orderId);
  const snap  = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  const order = snap.data()!;
  if (order.userId !== uid) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  const allowedStatuses = ['pending_payment', 'payment_expired'];
  if (!allowedStatuses.includes(order.status as string)) {
    return NextResponse.json({ error: 'Este pedido não pode mais receber um novo PIX.' }, { status: 400 });
  }

  // Só pedido de PIX: num pedido de cartão o PIX novo ficava com o método
  // "card", a conferência de pagamento consultava o lugar errado e o valor
  // era o do cartão.
  if ((order.payment as { method?: string } | undefined)?.method !== 'pix') {
    return NextResponse.json({ error: 'Este pedido não é de PIX.' }, { status: 400 });
  }

  // PIX atual ainda vale: devolve o mesmo. Dois QR válidos ao mesmo tempo
  // deixavam o cliente pagar duas vezes o mesmo pedido.
  const current = (order.payment ?? {}) as { txId?: string; pixQrCode?: string; pixCopyPaste?: string; expiresAt?: { toDate?: () => Date } | string | null };
  const currentExp = typeof current.expiresAt === 'string' ? new Date(current.expiresAt) : current.expiresAt?.toDate?.();
  if (order.status === 'pending_payment' && current.pixCopyPaste && currentExp && currentExp.getTime() > Date.now() + 60_000) {
    return NextResponse.json({
      orderId,
      txId: current.txId,
      qrCode: current.pixQrCode,
      copyPaste: current.pixCopyPaste,
      expiresAt: currentExp.toISOString(),
      totalCents: order.totalCents,
    });
  }

  const createdAtMs = new Date(order.createdAt?.toDate?.() ?? order.createdAt).getTime();
  if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > ORDER_PAYMENT_WINDOW_MS) {
    return NextResponse.json(
      { error: 'O prazo de pagamento deste pedido acabou. Faça um novo pedido.' },
      { status: 400 }
    );
  }

  // Quando o PIX expira, o webhook (transparent.expired) já liberou a reserva
  // de estoque. Voltar pra pending_payment sem reservar de novo deixava
  // reserved negativo depois (confirmOrderPaid/cancelamento decrementam de
  // novo) e o "disponível" inflado, ou seja, overselling. Aqui só uma
  // checagem prévia, pra não gerar cobrança se já não há estoque; a reserva
  // de verdade acontece na transação lá embaixo.
  const stockLines = expandStockLines((order.items ?? []) as StockItem[]);
  if (order.status === 'payment_expired') {
    const invSnaps = await Promise.all(stockLines.map(l => adminDb.collection('inventory').doc(l.sku).get()));
    for (let i = 0; i < stockLines.length; i++) {
      const inv = invSnaps[i];
      if (!inv.exists) continue;
      const available = (inv.data()!.quantity ?? 0) - (inv.data()!.reserved ?? 0);
      if (available < stockLines[i].quantity) {
        return NextResponse.json(
          { error: 'Um dos itens deste pedido não tem mais estoque. Faça um novo pedido.' },
          { status: 409 }
        );
      }
    }
  }

  // Carrega dados do usuário para customer
  const userSnap = await adminDb.collection('users').doc(uid).get();
  const userData = userSnap.data() ?? {};
  const hasAllCustomerFields = userData.email && userData.cpf && userData.phone && (userData.displayName ?? userData.name);
  const customerData = hasAllCustomerFields ? {
    name:      userData.displayName ?? userData.name,
    email:     userData.email,
    taxId:     userData.cpf,
    cellphone: userData.phone,
  } : undefined;

  const abacateSandbox = !!(order.payment as { abacateSandbox?: boolean } | undefined)?.abacateSandbox;
  const ABACATEPAY_KEY = abacatePayKey(abacateSandbox);
  if (!ABACATEPAY_KEY) {
    console.error(abacateSandbox ? 'ABACATEPAY_SANDBOX_API_KEY not set' : 'ABACATEPAY_API_KEY not set');
    return NextResponse.json({ error: 'Pagamento indisponível no momento. Tente em alguns minutos.' }, { status: 500 });
  }

  const pixPayload: Record<string, unknown> = {
    method: 'PIX',
    data: {
      amount: order.totalCents,
      // Ver nota em src/lib/abacatepay.ts: AbacatePay rejeita caractere fora do ASCII básico.
      description: sanitizePixDescription(
        `Pedido #${orderId.slice(-8).toUpperCase()}${abacateSandbox ? ' - TESTE' : ''}`
      ),
      expiresIn: 900,
      externalId: orderId,
      ...(customerData ? { customer: customerData } : {}),
    },
  };

  // Uma nova tentativa em falha de rede/5xx: com o mesmo externalId a
  // AbacatePay devolve o PIX pendente já criado (docs v2), sem cobrança dupla.
  const pixRes = await createPixWithRetry(() => fetch(`${ABACATEPAY_BASE}/transparents/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ABACATEPAY_KEY}` },
    body: JSON.stringify(pixPayload),
    signal: AbortSignal.timeout(10000),
  }));

  if (!pixRes.ok) {
    const detail = await pixRes.text();
    console.error('[regenerate-pix] AbacatePay error:', pixRes.status, detail);
    return NextResponse.json({ error: 'Erro ao gerar PIX' }, { status: 502 });
  }

  const pix = (await pixRes.json()).data;
  const nowIso = new Date().toISOString();

  // Transação: relê o status (o webhook pode ter confirmado o pagamento do
  // QR antigo enquanto este PIX era gerado, e um update cego voltaria um
  // pedido pago pra pending_payment) e, se o PIX tinha expirado, reserva o
  // estoque de novo de forma atômica.
  try {
    await adminDb.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      const freshStatus = fresh.data()?.status;
      if (freshStatus !== 'pending_payment' && freshStatus !== 'payment_expired') {
        throw new StockError('Este pedido mudou de status. Atualize a página.');
      }

      if (freshStatus === 'payment_expired') {
        const invRefs = stockLines.map(l => adminDb.collection('inventory').doc(l.sku));
        const invSnaps = await Promise.all(invRefs.map(r => tx.get(r)));
        for (let i = 0; i < stockLines.length; i++) {
          if (!invSnaps[i].exists) continue; // item sem controle de estoque
          const inv = invSnaps[i].data()!;
          if ((inv.quantity ?? 0) - (inv.reserved ?? 0) < stockLines[i].quantity) {
            throw new StockError('Um dos itens deste pedido não tem mais estoque. Faça um novo pedido.');
          }
        }
        for (let i = 0; i < stockLines.length; i++) {
          if (!invSnaps[i].exists) continue;
          tx.update(invRefs[i], {
            reserved: FieldValue.increment(stockLines[i].quantity),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      tx.update(ref, {
        status: 'pending_payment',
        'payment.txId':         pix.id,
        'payment.pixQrCode':    pix.brCodeBase64,
        'payment.pixCopyPaste': pix.brCode,
        'payment.expiresAt':    pix.expiresAt ? new Date(pix.expiresAt) : null,
        updatedAt: nowIso,
        timeline: FieldValue.arrayUnion({
          status: 'payment_initiated',
          at: nowIso,
          note: 'Novo PIX gerado pelo cliente',
        }),
      });
    });
  } catch (err) {
    if (err instanceof StockError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({
    orderId,
    txId:       pix.id,
    qrCode:     pix.brCodeBase64,
    copyPaste:  pix.brCode,
    expiresAt:  pix.expiresAt,
    totalCents: order.totalCents,
  });
}
