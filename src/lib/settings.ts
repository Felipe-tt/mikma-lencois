import { adminDb } from '@/lib/firebase/admin';
import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';

let cached: StoreSettings | null = null;
let cachedAt = 0;
// Aumentado de 1min → 10min: settings raramente mudam e cada leitura
// consome uma leitura de documento no Firestore (cobra por operação).
const TTL = 600_000; // 10 minutos

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
