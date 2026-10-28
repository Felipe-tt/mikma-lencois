#!/usr/bin/env node
/**
 * Restaura um backup do Firestore (feito por firestore-backup.mjs).
 *   Ver o conteúdo:  BACKUP_KEY=... node scripts/firestore-restore.mjs backup.mikmabk
 *   Gravar no banco: ... --aplicar [--so=orders,products]
 * Gravar sobrescreve os documentos de mesmo caminho e não apaga os outros.
 * Em produção, use GOOGLE_APPLICATION_CREDENTIALS; para testar antes, rode
 * contra o emulador (FIRESTORE_EMULATOR_HOST).
 */
import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { decodeValue, open } from './lib/backup-format.mjs';

const [file, ...flags] = process.argv.slice(2);
const password = process.env.BACKUP_KEY;
if (!file || !password) {
  console.error('Uso: BACKUP_KEY=... node scripts/firestore-restore.mjs backup.mikmabk [--aplicar] [--so=colecao1,colecao2]');
  process.exit(2);
}
const apply = flags.includes('--aplicar');
const only = flags.find(f => f.startsWith('--so='))?.slice(5).split(',').filter(Boolean);

const docs = open(readFileSync(file), password).split('\n').filter(Boolean).map(l => JSON.parse(l))
  .filter(x => !only || only.includes(x.p.split('/')[0]));
const counts = {};
for (const x of docs) counts[x.p.split('/')[0]] = (counts[x.p.split('/')[0]] ?? 0) + 1;
console.log(`${docs.length} documentos no backup${only ? ` (só ${only.join(', ')})` : ''}:`);
for (const [c, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(22)} ${n}`);
if (!apply) {
  console.log('\nNada gravado. Para restaurar, rode de novo com --aplicar.');
  process.exit(0);
}

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'mikma-lencois';
initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId });
const db = getFirestore();
const make = {
  timestamp: (s, n) => new Timestamp(s, n),
  geoPoint: (lat, lng) => new GeoPoint(lat, lng),
  ref: path => db.doc(path),
};
let written = 0;
for (let i = 0; i < docs.length; i += 400) {
  const batch = db.batch();
  for (const x of docs.slice(i, i + 400)) batch.set(db.doc(x.p), decodeValue(x.d, make));
  await batch.commit();
  written += Math.min(400, docs.length - i);
  console.log(`  gravados ${written}/${docs.length}`);
}
console.log(`Restaurado em ${projectId}${process.env.FIRESTORE_EMULATOR_HOST ? ' (emulador)' : ''}.`);
