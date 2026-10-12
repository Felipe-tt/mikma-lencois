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
 * Uso (rode UMA vez, no Cloud Shell, depois que o deploy novo estiver no ar):
 *   node scripts/purge-maintenance-queue.mjs            # só conta (dry-run)
 *   node scripts/purge-maintenance-queue.mjs --apply    # grava de fato
 *
 * Fora do Cloud Shell, passe o caminho de uma chave de service account como
 * primeiro argumento: node scripts/purge-maintenance-queue.mjs chave.json [--apply]
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const keyPath = args.find((a) => !a.startsWith('--')); // opcional

initializeApp(
  keyPath
    ? { credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) }
    // Sem chave: usa as credenciais do ambiente (ex.: Cloud Shell já logado).
    : { credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT || 'mikma-lencois' },
);
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
