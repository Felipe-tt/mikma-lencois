/**
 * Remove o campo `passwordHash` de TODOS os documentos de users/{uid}.
 *
 * Contexto: o cadastro e o reset de senha gravavam uma cópia do hash Argon2
 * no Firestore, mas nenhum código a lia (a senha vive só no Firebase Auth).
 * Como users/{uid} é legível por toda a equipe (seller/admin), a cópia só
 * aumentava a superfície de vazamento. O código novo não grava mais; este
 * script limpa o que já existe.
 *
 * Uso (rode uma vez, depois de publicar o deploy novo):
 *   node scripts/purge-password-hash.mjs /caminho/service-account.json           # só conta (dry-run)
 *   node scripts/purge-password-hash.mjs /caminho/service-account.json --apply   # apaga de fato
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const [keyPath, flag] = process.argv.slice(2);
const apply = flag === '--apply';

if (!keyPath) {
  console.error('[purge-password-hash] Uso: node scripts/purge-password-hash.mjs <service-account.json> [--apply]');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = getFirestore();

const snap = await db.collection('users').where('passwordHash', '!=', null).get();
console.log(`[purge-password-hash] ${snap.size} usuário(s) com passwordHash.`);

if (!apply) {
  console.log('[purge-password-hash] dry-run: nada foi alterado. Rode com --apply para apagar.');
  process.exit(0);
}

let done = 0;
for (let i = 0; i < snap.docs.length; i += 400) {
  const batch = db.batch();
  for (const d of snap.docs.slice(i, i + 400)) batch.update(d.ref, { passwordHash: FieldValue.delete() });
  await batch.commit();
  done += Math.min(400, snap.docs.length - i);
  console.log(`[purge-password-hash] ${done}/${snap.size}`);
}
console.log('[purge-password-hash] concluído.');
