import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'crypto';
import { notifySeller } from '@/lib/push/notifySeller';
import { notifyInApp } from '@/lib/push/notifyInApp';
import { hexToColorName } from '@/lib/colorNames';
import { SIZE_LABEL } from '@/lib/productOptions';

// Antes: uma notificação por SKU, repetida a cada 24h e a cada venda que
// baixava o estoque, inclusive de madrugada. Agora:
// - um resumo por rodada (uma notificação no celular, uma linha no sino);
// - só avisa quando o SKU muda de situação (ok -> baixo, baixo -> zerado);
//   continuar igual não repete. A página de Estoque mostra tudo.
// - produto desativado não conta;
// - de madrugada não notifica: a mudança fica para a próxima rodada de dia.
type Level = 'low' | 'zero';
const QUIET_START = 21; // 21h às 8h, horário de Brasília
const QUIET_END = 8;

function isQuietHour(now = new Date()): boolean {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(now));
  return h >= QUIET_START || h < QUIET_END;
}

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

  const productCache = new Map<string, { name: string; active: boolean }>();
  async function getProduct(productId: string): Promise<{ name: string; active: boolean }> {
    if (productCache.has(productId)) return productCache.get(productId)!;
    const d = (await adminDb.collection('products').doc(productId).get()).data();
    const p = { name: (d?.name as string | undefined) ?? productId, active: d?.active === true };
    productCache.set(productId, p);
    return p;
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

  // Situação anterior de cada SKU baixo (doc em stockAlerts). Muda de
  // situação = novo ou piorou (baixo -> zerado): entra no resumo.
  const changed: Array<{ sku: string; level: Level; label: string; available: number }> = [];
  const quiet = isQuietHour();
  for (const low of lowItems) {
    try {
      const product = await getProduct(low.productId);
      if (!product.active) continue;
      const level: Level = low.available <= 0 ? 'zero' : 'low';
      const alertRef = adminDb.collection('stockAlerts').doc(low.sku);
      const prev = (await alertRef.get()).data() as { level?: Level } | undefined;
      const worse = !prev?.level || (prev.level === 'low' && level === 'zero');
      if (!worse) {
        // Melhorou de zerado para baixo: só atualiza, sem avisar.
        if (prev?.level !== level) await alertRef.set({ level, available: low.available }, { merge: true });
        continue;
      }
      // Horário silencioso: não grava a nova situação, para avisar de dia.
      if (quiet) continue;
      const variant = low.variant as { size?: string; color?: string; colorName?: string } | undefined;
      const colorLabel = variant?.colorName || (variant?.color ? hexToColorName(variant.color) : undefined);
      const variantLabel = variant ? [variant.size ? (SIZE_LABEL[variant.size] ?? variant.size) : '', colorLabel].filter(Boolean).join(' · ') : '';
      changed.push({ sku: low.sku, level, available: low.available, label: variantLabel ? `${product.name} (${variantLabel})` : product.name });
      await alertRef.set({
        sku: low.sku, productId: low.productId, level, available: low.available,
        lastNotifiedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.error(`[low-stock] erro processando SKU ${low.sku}:`, err);
      results.errors++;
    }
  }

  if (changed.length > 0) {
    const zero = changed.filter(c => c.level === 'zero');
    const low = changed.filter(c => c.level === 'low');
    const parts = [
      zero.length ? `${zero.length} ${zero.length === 1 ? 'zerou' : 'zeraram'}` : '',
      low.length ? `${low.length} ${low.length === 1 ? 'ficou baixo' : 'ficaram baixos'}` : '',
    ].filter(Boolean).join(', ');
    // Zerados primeiro; até 3 nomes, o resto vira "e mais N".
    const names = [...zero, ...low].map(c => c.label);
    const shown = names.slice(0, 3).join('; ') + (names.length > 3 ? `; e mais ${names.length - 3}` : '');
    await notifySeller({
      title: `Estoque: ${parts}`,
      body: shown,
      url: '/painel/estoque',
      data: { event: 'low_stock' },
    });
    // Uma linha só no sino, sempre atualizada (dedupe fixo).
    await notifyInApp({
      type: 'low_stock',
      message: `Estoque: ${parts}. ${shown}`,
      url: '/painel/estoque',
      dedupeKey: 'low_stock:resumo',
    });
    results.notified = changed.length;
  }

  // Limpa alertas de SKUs que voltaram a ficar saudáveis, pra não acumular
  // lixo e pra que, se cair de novo no futuro, o aviso dispare na hora
  // (sem esperar o cooldown de um alerta antigo que não faz mais sentido).
  // Some também a notificação do sino desse SKU (dedupeKey = mesmo id),
  // senão ficaria uma linha de "estoque baixo" pra sempre visível mesmo
  // depois de repor.
  const lowSkus = new Set(lowItems.map(l => l.sku));
  const alertsSnap = await adminDb.collection('stockAlerts').get();
  const recoveredDocs = alertsSnap.docs.filter(d => !lowSkus.has(d.id));
  // 2 operações por SKU e o lote aceita no máximo 500: em lotes de 200.
  for (let i = 0; i < recoveredDocs.length; i += 200) {
    const batch = adminDb.batch();
    for (const doc of recoveredDocs.slice(i, i + 200)) {
      batch.delete(doc.ref);
      batch.delete(adminDb.collection('notifications').doc('seller').collection('items').doc(`low_stock:${doc.id}`));
    }
    await batch.commit();
  }
  if (recoveredDocs.length > 0) results.recovered = recoveredDocs.length;

  // Avisos antigos, um por SKU no sino (antes do resumo): some com eles.
  for (let i = 0; i < lowItems.length; i += 400) {
    const batch = adminDb.batch();
    for (const low of lowItems.slice(i, i + 400)) {
      batch.delete(adminDb.collection('notifications').doc('seller').collection('items').doc(`low_stock:${low.sku}`));
    }
    await batch.commit();
  }

  return NextResponse.json({ ok: true, ...results });
}
