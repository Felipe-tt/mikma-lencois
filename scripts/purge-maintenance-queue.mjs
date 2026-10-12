/**
 * Apaga TODOS os documentos de maintenance_queue.
 *
 * Contexto: até a correção de segurança, essa coleção era legível por qualquer
 * pessoa na internet e guardava IP, user-agent, referer e a URL completa
 * (com a query string, que podia conter tokens de redefinição de senha e de
 * confirmação de e-mail) de cada visitante durante manutenções. O código novo
 * usa outro formato de ID (HMAC do IP) e não grava mais query string, então os
 * documentos antigos são só passivo de privacidade (LGPD).
 *
 * Consequência: IPs que estavam "liberados" precisam ser liberados de novo
 * pelo painel (Manutenção).
 *
 * Uso (rode uma vez, depois do deploy):
 *   node scripts/purge-maintenance-queue.mjs /caminho/service-account.json           # só conta
 *   node scripts/purge-maintenance-queue.mjs /caminho/service-account.json --apply   # apaga
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const [keyPath, flag] = process.argv.slice(2);
const apply = flag === '--apply';
if (!keyPath) {
  console.error('[purge-maintenance-queue] Uso: node scripts/purge-maintenance-queue.mjs <service-account.json> [--apply]');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = getFirestore();

const snap = await db.collection('maintenance_queue').get();
console.log(`[purge-maintenance-queue] ${snap.size} documento(s).`);
if (!apply) {
  console.log('[purge-maintenance-queue] dry-run: nada foi alterado. Rode com --apply para apagar.');
  process.exit(0);
}

for (let i = 0; i < snap.docs.length; i += 400) {
  const batch = db.batch();
  for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
  await batch.commit();
  console.log(`[purge-maintenance-queue] ${Math.min(i + 400, snap.size)}/${snap.size}`);
}
console.log('[purge-maintenance-queue] concluído.');
