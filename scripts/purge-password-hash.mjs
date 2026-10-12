/**
 * Remove o campo `passwordHash` de TODOS os documentos de users/{uid}.
 *
 * Contexto: o cadastro e o reset de senha gravavam uma cópia do hash Argon2
 * no Firestore, mas nenhum código a lia (a senha vive só no Firebase Auth).
 * Como users/{uid} é legível por toda a equipe (seller/admin), a cópia só
 * aumentava a superfície de vazamento. O código novo não grava mais; este
 * script limpa o que já existe.
 *
 * Uso (rode UMA vez, no Cloud Shell, depois que o deploy novo estiver no ar):
 *   node scripts/purge-password-hash.mjs            # só conta (dry-run)
 *   node scripts/purge-password-hash.mjs --apply    # grava de fato
 *
 * Fora do Cloud Shell, passe o caminho de uma chave de service account como
 * primeiro argumento: node scripts/purge-password-hash.mjs chave.json [--apply]
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
