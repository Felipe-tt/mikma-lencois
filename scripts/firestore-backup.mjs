#!/usr/bin/env node
/**
 * Backup do Firestore: lê todas as coleções e subcoleções (menos as
 * descartáveis, ver SKIP_COLLECTIONS), comprime e criptografa num arquivo só.
 * Uso: BACKUP_KEY=... node scripts/firestore-backup.mjs saida.mikmabk
 * Credenciais: GOOGLE_APPLICATION_CREDENTIALS (service account) ou, nos
 * testes, FIRESTORE_EMULATOR_HOST. Custo: uma leitura por documento, dentro
 * da cota grátis diária do Firestore (50 mil) para o tamanho da loja.
 */
import { writeFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { encodeValue, seal, SKIP_COLLECTIONS } from './lib/backup-format.mjs';

const out = process.argv[2];
const password = process.env.BACKUP_KEY;
if (!out || !password) {
  console.error('Uso: BACKUP_KEY=... node scripts/firestore-backup.mjs saida.mikmabk');
  process.exit(2);
}
// Teto de segurança: acima disso o backup diário sairia da cota grátis.
const MAX_DOCS = Number(process.env.BACKUP_MAX_DOCS || 40_000);

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'mikma-lencois';
initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId });
const db = getFirestore();

const lines = [];
const counts = {};
async function dump(collection, root) {
  const snap = await collection.get();
  for (const doc of snap.docs) {
    if (lines.length >= MAX_DOCS) throw new Error(`Mais de ${MAX_DOCS} documentos: ajuste BACKUP_MAX_DOCS (custo de leitura)`);
    lines.push(JSON.stringify({ p: doc.ref.path, d: encodeValue(doc.data()) }));
    counts[root] = (counts[root] ?? 0) + 1;
    for (const sub of await doc.ref.listCollections()) await dump(sub, root);
  }
}

const started = Date.now();
for (const col of await db.listCollections()) {
  if (SKIP_COLLECTIONS.has(col.id)) continue;
  await dump(col, col.id);
}
const file = seal(lines.join('\n'), password);
writeFileSync(out, file);
console.log(`Backup: ${lines.length} documentos, ${(file.length / 1024).toFixed(1)} KB, ${((Date.now() - started) / 1000).toFixed(1)}s`);
for (const [c, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(22)} ${n}`);
