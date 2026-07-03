import { adminDb } from '@/lib/firebase/admin';
import { STORE_DEFAULTS, type StoreSettings } from '@/lib/store-settings';

let cached: StoreSettings | null = null;
let cachedAt = 0;
// TTL curto: mudanças no painel (ex: raio de entrega Uber) precisam refletir
// quase imediatamente. 1h de cache fazia o admin mudar uma config e o site
// continuar servindo o valor antigo por até 1 hora. Trade-off: mais uma
// leitura no Firestore por minuto (irrelevante em custo) em troca de
// configurações que funcionam quando salvas.
const TTL = 60_000; // 1 minuto

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
