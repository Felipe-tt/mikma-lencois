import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Acesso direto ao banco dos emuladores, para o teste conferir o que ficou
 * gravado e arrumar o cenário. (firebase-admin/auth não carrega dentro do
 * Playwright: o uid vem sempre do cadastro em `users`.)
 */
const app = () => getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-mikma' });
export const db = () => getFirestore(app());

async function uidOf(email: string): Promise<string | undefined> {
  const user = await db().collection('users').where('email', '==', email).limit(1).get();
  return user.docs[0]?.id;
}

/** Outro teste já criou a passkey da conta em outro navegador: começa do zero. */
export async function forgetPasskeys(email: string) {
  const uid = await uidOf(email);
  if (!uid) return;
  const snap = await db().collection('passkeys').where('uid', '==', uid).get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
}

/** Carrinho vazio: uma tentativa anterior do mesmo teste pode ter deixado item. */
export async function emptyCart(email: string) {
  const uid = await uidOf(email);
  if (uid) await db().collection('carts').doc(uid).set({ items: [], couponCode: null, updatedAt: new Date().toISOString() });
}

export interface StoredOrder {
  status?: string;
  totalCents?: number;
  shippingCents?: number;
  selectedShipping?: { carrier?: string; label?: string; priceCents?: number; estimatedDays?: number };
  delivery?: { carrier?: string; priceCents?: number; realPriceCents?: number; trackingCode?: string; shippingCostCents?: number };
  timeline?: Array<{ status: string; note?: string }>;
}

export async function readOrder(id: string): Promise<StoredOrder> {
  return ((await db().collection('orders').doc(id).get()).data() ?? {}) as StoredOrder;
}
