import { cacheLife, cacheTag } from 'next/cache';
import { adminDb } from '@/lib/firebase/admin';
import { STORE_DEFAULTS, withStoreDefaults, type StoreSettings } from '@/lib/store-settings';
import { serialize } from '@/lib/utils/serialize';
import { pauseNotice, type PauseSettings } from '@/lib/salesPause';

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
    cached = withStoreDefaults(snap.exists ? snap.data() : undefined);
    cachedAt = Date.now();
    return cached;
  } catch {
    return STORE_DEFAULTS;
  }
}

/**
 * Configurações para as páginas da loja: em cache ('use cache') por 1 min,
 * como o getSettings, e limpas na hora com revalidateTag('settings') quando
 * o painel salva. Entram no HTML estático (prerender parcial).
 */
export async function getStoreSettings(): Promise<StoreSettings> {
  'use cache';
  cacheTag('settings');
  // Lê direto (sem o cache em memória do getSettings): depois de um
  // revalidateTag('settings') a página já sai com o valor novo.
  try {
    const snap = await adminDb.collection('settings').doc('store').get();
    cacheLife({ stale: 60, revalidate: 60, expire: 86_400 });
    return serialize<StoreSettings>(withStoreDefaults(snap.exists ? snap.data() : undefined));
  } catch {
    cacheLife({ stale: 30, revalidate: 60, expire: 300 });
    return STORE_DEFAULTS;
  }
}

/**
 * Aviso de vendas pausadas lido direto do banco (sem o cache de 1 min):
 * ligar a pausa no painel bloqueia a próxima compra na hora.
 */
export async function getPauseNoticeNow(): Promise<string | null> {
  try {
    const snap = await adminDb.collection('settings').doc('store').get();
    return pauseNotice((snap.data() ?? {}) as PauseSettings);
  } catch {
    return null;
  }
}
