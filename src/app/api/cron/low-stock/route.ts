export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'crypto';
import { notifySeller } from '@/lib/push/notifySeller';
import { notifyInApp } from '@/lib/push/notifyInApp';

// Não reavisa do mesmo SKU antes desse tempo, mesmo que continue baixo —
// senão vira ruído (ex: roda de hora em hora e o estoque não mudou nesse
// meio-tempo). Reavisa se: passou o cooldown, OU piorou desde o último
// aviso (ex: foi de "baixo" pra "zerado").
const RENOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

export async function GET(req: NextRequest) {
  // Mesmo padrão de autenticação do cron de expirar pedidos.
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  const isValid = !!secret && !!expected && secret.length === expected.length
    && timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = { checked: 0, low: 0, notified: 0, recovered: 0, errors: 0 };

  const invSnap = await adminDb.collection('inventory').get();
  results.checked = invSnap.size;

  const productNameCache = new Map<string, string>();
  async function getProductName(productId: string): Promise<string> {
    if (productNameCache.has(productId)) return productNameCache.get(productId)!;
    try {
      const pSnap = await adminDb.collection('products').doc(productId).get();
      const name = (pSnap.data()?.name as string | undefined) ?? productId;
      productNameCache.set(productId, name);
      return name;
    } catch {
      return productId;
    }
  }

  const lowItems: Array<{ sku: string; productId: string; variant: unknown; available: number; threshold: number }> = [];

  for (const doc of invSnap.docs) {
    const item = doc.data() as {
      productId: string; sku: string; variant?: { size?: string; fabric?: string; color?: string };
      quantity?: number; reserved?: number; lowStockThreshold?: number;
    };
    const available = (item.quantity ?? 0) - (item.reserved ?? 0);
    const threshold = item.lowStockThreshold ?? 0;
    if (available <= threshold) {
      lowItems.push({ sku: item.sku ?? doc.id, productId: item.productId, variant: item.variant, available, threshold });
    }
  }
  results.low = lowItems.length;

  // Recupera alertas anteriores pra decidir quem já foi avisado e quando —
  // um get por SKU seria N chamadas; como o volume de SKUs baixos costuma
  // ser pequeno numa loja desse porte, tudo bem.
  for (const low of lowItems) {
    try {
      const alertRef = adminDb.collection('stockAlerts').doc(low.sku);
      const alertSnap = await alertRef.get();
      const prev = alertSnap.exists ? alertSnap.data() as { lastNotifiedAt?: FirebaseFirestore.Timestamp; lastAvailable?: number } : null;

      const cooldownPassed = !prev?.lastNotifiedAt || (Date.now() - prev.lastNotifiedAt.toMillis()) > RENOTIFY_COOLDOWN_MS;
      const gotWorse = prev?.lastAvailable !== undefined && low.available < prev.lastAvailable;

      if (cooldownPassed || gotWorse) {
        const productName = await getProductName(low.productId);
        const variant = low.variant as { size?: string; fabric?: string; color?: string } | undefined;
        const variantLabel = variant ? [variant.size, variant.fabric, variant.color].filter(Boolean).join(' · ') : '';
        const label = variantLabel ? `${productName} (${variantLabel})` : productName;
        const statusWord = low.available <= 0 ? 'Zerou' : 'Estoque baixo';

        await notifySeller({
          title: `${statusWord}: ${label}`,
          body: `Restam ${low.available} unidade(s) (SKU ${low.sku}). Hora de repor.`,
          url: '/painel/estoque',
          data: { sku: low.sku, event: 'low_stock' },
        });
        await notifyInApp({
          type: 'low_stock',
          message: `${statusWord}: ${label} — restam ${low.available} unidade(s)`,
          url: '/painel/estoque',
        });

        await alertRef.set({
          sku: low.sku, productId: low.productId, available: low.available,
          lastAvailable: low.available, lastNotifiedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        results.notified++;
      }
    } catch (err) {
      console.error(`[low-stock] erro processando SKU ${low.sku}:`, err);
      results.errors++;
    }
  }

  // Limpa alertas de SKUs que voltaram a ficar saudáveis, pra não acumular
  // lixo e pra que, se cair de novo no futuro, o aviso dispare na hora
  // (sem esperar o cooldown de um alerta antigo que não faz mais sentido).
  const lowSkus = new Set(lowItems.map(l => l.sku));
  const alertsSnap = await adminDb.collection('stockAlerts').get();
  const batch = adminDb.batch();
  let toDelete = 0;
  for (const doc of alertsSnap.docs) {
    if (!lowSkus.has(doc.id)) { batch.delete(doc.ref); toDelete++; }
  }
  if (toDelete > 0) { await batch.commit(); results.recovered = toDelete; }

  return NextResponse.json({ ok: true, ...results });
}
