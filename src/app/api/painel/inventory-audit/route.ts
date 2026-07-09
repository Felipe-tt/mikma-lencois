export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, getClientIp } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { adminDb } from '@/lib/firebase/admin';

/**
 * Auditoria somente leitura do estoque.
 *
 * Por quê: reserved em `inventory` é mantido por incrementos/decrementos
 * espalhados em vários endpoints (create-checkout, create-pix, webhook de
 * pagamento, cancelamento manual, cron de expiração). Antes da correção
 * de concorrência nesses pontos, uma corrida entre o cron de expiração e
 * o webhook de pagamento podia decrementar reserved duas vezes para o
 * mesmo pedido — essa rota não corrige nada, só calcula o valor "correto"
 * de reserved a partir da fonte da verdade (pedidos pending_payment) e
 * mostra a diferença, para decidir o que fazer manualmente.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  // Rota cara (varre todos os pedidos pending_payment + todo o inventário,
  // até 30s de execução) — limite mais apertado que o normal.
  const ip = getClientIp(req);
  const key = `inventory-audit:${auth.decoded.uid}`;
  if (!rateLimit(key, 6, 60_000) || !rateLimit(`inventory-audit-ip:${ip}`, 12, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde um pouco antes de rodar a auditoria de novo.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  // ── 1. Soma, por SKU, quanto deveria estar reservado ──────────────────
  // Fonte da verdade: pedidos com status pending_payment são os únicos
  // que devem ter estoque reservado (paid já debita quantity direto;
  // cancelled/payment_expired não reservam nada).
  const pendingOrdersSnap = await adminDb
    .collection('orders')
    .where('status', '==', 'pending_payment')
    .get();

  const expectedReservedBySku: Record<string, number> = {};
  for (const doc of pendingOrdersSnap.docs) {
    const items = (doc.data().items ?? []) as Array<{ sku: string; quantity: number }>;
    for (const item of items) {
      if (!item.sku) continue;
      expectedReservedBySku[item.sku] = (expectedReservedBySku[item.sku] ?? 0) + (item.quantity ?? 0);
    }
  }

  // ── 2. Compara com o reserved atual em cada doc de inventory ──────────
  const inventorySnap = await adminDb.collection('inventory').get();
  const skuMismatches: Array<{
    sku: string;
    productId: string;
    currentReserved: number;
    expectedReserved: number;
    diff: number;
  }> = [];

  for (const doc of inventorySnap.docs) {
    const data = doc.data();
    const currentReserved = (data.reserved ?? 0) as number;
    const expectedReserved = expectedReservedBySku[doc.id] ?? 0;
    if (currentReserved !== expectedReserved) {
      skuMismatches.push({
        sku: doc.id,
        productId: (data.productId ?? '') as string,
        currentReserved,
        expectedReserved,
        diff: currentReserved - expectedReserved,
      });
    }
  }

  // ── 3. Pedidos cancelados que parecem ter sido pagos ───────────────────
  // Sinal mais forte de corrupção: status === 'cancelled' mas
  // payment.paidAt existe (só confirmOrder, no webhook, preenche isso).
  const cancelledSnap = await adminDb
    .collection('orders')
    .where('status', '==', 'cancelled')
    .get();

  const suspiciousCancellations: Array<{
    orderId: string;
    cancelledBy?: string;
    cancelledAt?: string;
    paidAt: unknown;
    totalCents?: number;
  }> = [];

  for (const doc of cancelledSnap.docs) {
    const data = doc.data();
    const paidAt = data.payment?.paidAt;
    if (paidAt) {
      suspiciousCancellations.push({
        orderId: doc.id,
        cancelledBy: data.cancelledBy as string | undefined,
        cancelledAt: data.cancelledAt as string | undefined,
        paidAt,
        totalCents: data.totalCents as number | undefined,
      });
    }
  }

  return NextResponse.json({
    summary: {
      pendingOrdersChecked: pendingOrdersSnap.size,
      inventoryItemsChecked: inventorySnap.size,
      skuMismatchCount: skuMismatches.length,
      suspiciousCancellationCount: suspiciousCancellations.length,
    },
    skuMismatches,
    suspiciousCancellations,
  });
}
