import * as Sentry from '@sentry/nextjs';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { assessRisk, type OrderRisk, type RiskAssessment } from '@/lib/fraudSignals';

export type { OrderRisk } from '@/lib/fraudSignals';
import { notifySeller } from '@/lib/push/notifySeller';
import type { Order } from '@/types';

/**
 * Detector de golpe: avalia o pedido quando o pagamento é confirmado e grava
 * o resultado em `order.risk`. Risco alto segura o envio (shippingBlockReason)
 * e a nota automática até alguém da equipe conferir e liberar no painel.
 */

const DAY = 24 * 60 * 60 * 1000;
const declinesRef = (uid: string) => adminDb.collection('cardDeclines').doc(uid);

/** Registra um cartão recusado (para o sinal de "vários cartões testados"). Nunca lança. */
export async function recordCardDecline(uid: string): Promise<void> {
  try {
    await adminDb.runTransaction(async tx => {
      const snap = await tx.get(declinesRef(uid));
      const recent = ((snap.get('at') as number[] | undefined) ?? []).filter(t => Date.now() - t < DAY);
      tx.set(declinesRef(uid), { at: [...recent, Date.now()].slice(-20), updatedAt: FieldValue.serverTimestamp() });
    });
  } catch (err) {
    console.warn('[risk] não registrou cartão recusado:', err);
  }
}

/** Junta os dados e calcula o risco de um pedido (sem gravar). */
export async function assessOrderRisk(orderId: string): Promise<RiskAssessment | null> {
  const snap = await adminDb.collection('orders').doc(orderId).get();
  if (!snap.exists) return null;
  const order = { id: snap.id, ...snap.data() } as Order;
  const uid = order.userId;

  const [byAddress, byIp, userSnap, declinesSnap, authUser] = await Promise.all([
    order.addressKey ? adminDb.collection('orders').where('addressKey', '==', order.addressKey).limit(20).get() : null,
    order.clientIp ? adminDb.collection('orders').where('clientIp', '==', order.clientIp).limit(20).get() : null,
    adminDb.collection('users').doc(uid).get(),
    declinesRef(uid).get(),
    adminAuth.getUser(uid).catch(() => null),
  ]);
  const seen = new Map<string, Order>();
  for (const qs of [byAddress, byIp]) for (const d of qs?.docs ?? []) seen.set(d.id, { id: d.id, ...d.data() } as Order);

  const cpf = String(userSnap.get('cpf') ?? '').replace(/\D/g, '');
  const sameCpfAccounts = cpf.length === 11
    ? (await adminDb.collection('users').where('cpf', '==', cpf).limit(10).get()).docs.filter(d => d.id !== uid).length
    : 0;

  const orderTime = Date.parse(order.createdAt) || Date.now();
  const declines = ((declinesSnap.get('at') as number[] | undefined) ?? []).filter(t => t <= orderTime + 60 * 60_000 && orderTime - t < DAY);
  const created = authUser?.metadata.creationTime ? Date.parse(authUser.metadata.creationTime) : NaN;

  return assessRisk(order, {
    candidates: Array.from(seen.values()),
    sameCpfAccounts,
    cardDeclines24h: declines.length,
    accountAgeMs: Number.isFinite(created) ? orderTime - created : undefined,
    isGuest: !!authUser && authUser.providerData.length === 0,
    email: (userSnap.get('email') as string | undefined) ?? authUser?.email ?? order.customerEmail,
    pickup: order.delivery?.carrier === 'pickup',
  });
}

/** Avalia e grava `order.risk`; avisa a equipe se o risco for alto. Nunca lança. */
export async function storeOrderRisk(orderId: string): Promise<OrderRisk | null> {
  try {
    const assessment = await assessOrderRisk(orderId);
    if (!assessment) return null;
    const ref = adminDb.collection('orders').doc(orderId);
    const prev = (await ref.get()).get('risk') as OrderRisk | undefined;
    const risk: OrderRisk = {
      ...assessment,
      assessedAt: new Date().toISOString(),
      // Já liberado por alguém: reavaliar não volta a segurar.
      hold: assessment.level === 'alto' && !prev?.releasedBy,
      ...(prev?.releasedBy ? { releasedBy: prev.releasedBy, releasedAt: prev.releasedAt } : {}),
    };
    await ref.update({ risk });
    if (risk.hold && !prev?.hold) {
      const code = orderId.slice(-8).toUpperCase();
      await adminDb.collection('notifications').doc('seller').collection('items').doc().set({
        type: 'risk_hold',
        orderId,
        message: `Pedido #${code} parece suspeito (${assessment.signals.map(s => s.reason).join('; ').slice(0, 250)}). Confira antes de enviar.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      }).catch(() => {});
      await notifySeller({
        title: 'Pedido suspeito: confira antes de enviar',
        body: `#${code} · ${assessment.signals[0]?.reason ?? 'vários sinais'}`,
        url: `/painel/pedidos/${orderId}`,
        data: { orderId, event: 'risk_hold' },
      });
    }
    return risk;
  } catch (err) {
    console.error(`[risk] avaliação falhou (${orderId}):`, err);
    Sentry.captureException(err, { tags: { area: 'risk' }, extra: { orderId } });
    return null;
  }
}

/** Equipe conferiu: libera o envio (fica registrado quem e quando). */
export async function releaseOrderRisk(orderId: string, by: string): Promise<boolean> {
  const ref = adminDb.collection('orders').doc(orderId);
  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const risk = snap.get('risk') as OrderRisk | undefined;
    if (!snap.exists || !risk?.hold) return false;
    const at = new Date().toISOString();
    tx.update(ref, {
      'risk.hold': false,
      'risk.releasedBy': by,
      'risk.releasedAt': at,
      timeline: FieldValue.arrayUnion({ status: snap.get('status'), at, note: 'Pedido conferido pela equipe: envio liberado' }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}
