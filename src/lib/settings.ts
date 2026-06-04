import { adminDb } from '@/lib/firebase/admin';
import { STORE_DEFAULTS, type StoreSettings } from '@/app/painel/configuracoes/page';

let cached: StoreSettings | null = null;
let cachedAt = 0;
const TTL = 60_000; // 1 min

export async function getSettings(): Promise<StoreSettings> {
  if (cached && Date.now() - cachedAt < TTL) return cached;
  try {
    const snap = await adminDb.collection('settings').doc('store').get();
    cached = { ...STORE_DEFAULTS, ...(snap.exists ? snap.data() : {}) } as StoreSettings;
    cachedAt = Date.now();
    return cached;
  } catch {
    return STORE_DEFAULTS;
  }
}
