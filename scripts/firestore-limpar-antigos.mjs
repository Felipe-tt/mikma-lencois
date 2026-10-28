#!/usr/bin/env node
/**
 * Apaga, uma vez, os documentos temporários gravados antes do expireAt
 * existir: sem esse campo o TTL do Firestore nunca apaga. Os novos já
 * nascem com expireAt e somem sozinhos.
 * Uso: node scripts/firestore-limpar-antigos.mjs [--aplicar]
 * Sem --aplicar só conta. Custo: uma leitura por documento dessas coleções.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTIONS = ['webhook_deliveries', 'trackingCache', 'geocache', 'webauthnChallenges'];
const aplicar = process.argv.includes('--aplicar');

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'mikma-lencois';
initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId });
const db = getFirestore();
const writer = db.bulkWriter();

for (const name of COLLECTIONS) {
  const snap = await db.collection(name).get();
  const old = snap.docs.filter(d => d.get('expireAt') === undefined);
  console.log(`${name.padEnd(20)} ${snap.size} documentos, ${old.length} sem expireAt${aplicar ? ' (apagando)' : ''}`);
  if (aplicar) for (const d of old) writer.delete(d.ref);
}
await writer.close();
