export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, getClientIp } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { computeExpectedReserved as sumExpected, findReservedMismatches, type SkuMismatch } from '@/lib/inventoryAudit';

interface SuspiciousCancellation {
  orderId: string;
  cancelledBy?: string;
  cancelledAt?: string;
  paidAt: unknown;
  totalCents?: number;
}

/**
 * Calcula, por SKU, quanto DEVERIA estar reservado agora, a partir da
 * fonte da verdade: os pedidos com status pending_payment. Pedidos pagos
 * ja debitaram quantity direto e zeraram a reserva; cancelados e
 * expirados nao reservam nada.
 *
 * Usa expandStockLines (a mesma funcao usada em create-pix,
 * create-checkout, webhook de pagamento, cancelamento e cron de
 * expiracao) em vez de somar item.sku na mao. Isso importa: um Jogo de
 * Cama com fronha trocada reserva DOIS SKUs (o do jogo e o da fronha
 * escolhida), e a versao anterior desta auditoria ignorava o swapSku
 * completamente, entao todo pedido com troca de fronha virava um falso
 * positivo, acusando "sobra" de reserva numa fronha que na verdade
 * estava corretamente reservada. Pior que o alarme falso: o ruido
 * escondia as divergencias reais no meio da lista.
 */
async function computeExpectedReserved(): Promise<{
  expectedBySku: Record<string, number>;
  pendingOrdersChecked: number;
}> {
  const pendingOrdersSnap = await adminDb
    .collection('orders')
    .where('status', '==', 'pending_payment')
    .get();

  const ordersItems = pendingOrdersSnap.docs.map(doc => (doc.data().items ?? []) as Array<{
    productId: string; sku: string; quantity: number;
    swapSku?: string; swapQtyPerUnit?: number;
  }>);

  return { expectedBySku: sumExpected(ordersItems), pendingOrdersChecked: pendingOrdersSnap.size };
}

async function findMismatches(expectedBySku: Record<string, number>): Promise<{
  mismatches: SkuMismatch[];
  inventoryItemsChecked: number;
}> {
  const inventorySnap = await adminDb.collection('inventory').get();
  const inventory = inventorySnap.docs.map(doc => ({
    sku: doc.id,
    productId: (doc.data().productId ?? '') as string,
    reserved: (doc.data().reserved ?? 0) as number,
  }));

  return {
    mismatches: findReservedMismatches(inventory, expectedBySku),
    inventoryItemsChecked: inventorySnap.size,
  };
}

/** GET, auditoria somente leitura. Nao altera nada. */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  // Rota cara (varre todos os pedidos pending_payment + todo o inventario,
  // ate 30s de execucao), limite mais apertado que o normal.
  const ip = getClientIp(req);
  const key = `inventory-audit:${auth.decoded.uid}`;
  if (!await rateLimit(key, 6, 60_000) || !await rateLimit(`inventory-audit-ip:${ip}`, 12, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde um pouco antes de rodar a auditoria de novo.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  const { expectedBySku, pendingOrdersChecked } = await computeExpectedReserved();
  const { mismatches, inventoryItemsChecked } = await findMismatches(expectedBySku);

  // Pedidos cancelados que parecem ter sido pagos. Sinal mais forte de
  // corrupcao: status === 'cancelled' mas payment.paidAt existe (so a
  // confirmacao de pagamento preenche isso).
  const cancelledSnap = await adminDb
    .collection('orders')
    .where('status', '==', 'cancelled')
    .get();

  const suspiciousCancellations: SuspiciousCancellation[] = [];
  for (const doc of cancelledSnap.docs) {
    const data = doc.data();
    if (data.payment?.paidAt) {
      suspiciousCancellations.push({
        orderId: doc.id,
        cancelledBy: data.cancelledBy as string | undefined,
        cancelledAt: data.cancelledAt as string | undefined,
        paidAt: data.payment.paidAt,
        totalCents: data.totalCents as number | undefined,
      });
    }
  }

  return NextResponse.json({
    summary: {
      pendingOrdersChecked,
      inventoryItemsChecked,
      skuMismatchCount: mismatches.length,
      suspiciousCancellationCount: suspiciousCancellations.length,
    },
    skuMismatches: mismatches,
    suspiciousCancellations,
  });
}

/**
 * POST, corrige as divergencias de `reserved`, gravando o valor correto
 * calculado a partir dos pedidos pending_payment.
 *
 * Por que e seguro mexer em `reserved` automaticamente, mas NAO em
 * `quantity`: reserved e um numero derivado, da pra recalcular do zero a
 * qualquer momento a partir dos pedidos em aberto. Ja quantity e o
 * estoque fisico real, que so uma contagem na prateleira confirma,
 * nenhuma rota automatica tem como saber quantas pecas existem de
 * verdade, entao esta rota nunca toca nele.
 *
 * Cada correcao e feita numa transacao que rele o valor dentro dela e so
 * escreve se o estado ainda for o mesmo que a auditoria viu. Se um
 * pedido novo entrar no meio do caminho (mudando o esperado), a correcao
 * daquele SKU e pulada em vez de gravar um numero ja desatualizado.
 * Grava tambem uma entrada no history do item, pro vendedor ver depois o
 * que foi mexido e por que.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const ip = getClientIp(req);
  const key = `inventory-audit-fix:${auth.decoded.uid}`;
  if (!await rateLimit(key, 3, 60_000) || !await rateLimit(`inventory-audit-fix-ip:${ip}`, 6, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde um pouco antes de corrigir de novo.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  const { expectedBySku } = await computeExpectedReserved();
  const { mismatches } = await findMismatches(expectedBySku);

  if (mismatches.length === 0) {
    return NextResponse.json({ ok: true, corrected: 0, skipped: 0, details: [] });
  }

  const now = new Date().toISOString();
  const by = auth.decoded.uid;
  const details: Array<{ sku: string; from: number; to: number; status: 'corrigido' | 'pulado' }> = [];
  let corrected = 0;
  let skipped = 0;

  for (const m of mismatches) {
    const ref = adminDb.collection('inventory').doc(m.sku);
    try {
      const applied = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return false;

        const current = (snap.data()?.reserved ?? 0) as number;
        // Estado mudou entre a leitura da auditoria e agora (pedido novo
        // reservou, webhook liberou, etc). Pular: na proxima rodada a
        // auditoria pega o valor ja atualizado.
        if (current !== m.currentReserved) return false;
        if (current === m.expectedReserved) return false;

        tx.update(ref, {
          reserved: m.expectedReserved,
          updatedAt: FieldValue.serverTimestamp(),
          history: FieldValue.arrayUnion({
            type: m.expectedReserved > current ? 'out' : 'in',
            quantity: Math.abs(m.expectedReserved - current),
            reason: `Auditoria: reserva corrigida de ${current} para ${m.expectedReserved}`,
            date: now,
            by,
          }),
        });
        return true;
      });

      if (applied) {
        corrected++;
        details.push({ sku: m.sku, from: m.currentReserved, to: m.expectedReserved, status: 'corrigido' });
      } else {
        skipped++;
        details.push({ sku: m.sku, from: m.currentReserved, to: m.expectedReserved, status: 'pulado' });
      }
    } catch (err) {
      console.error(`[inventory-audit] falha ao corrigir ${m.sku}:`, err);
      skipped++;
      details.push({ sku: m.sku, from: m.currentReserved, to: m.expectedReserved, status: 'pulado' });
    }
  }

  return NextResponse.json({ ok: true, corrected, skipped, details });
}
