/**
 * Apaga do Storage as fotos de produto que nada mais usa.
 *
 * Contexto: até a correção da regra do Storage, apagar foto pelo painel era
 * sempre negado, então toda foto trocada ou removida ficou guardada (e
 * pagando armazenamento).
 *
 * "Usada" = o caminho do arquivo aparece em qualquer texto de qualquer
 * documento do Firestore (produtos, pedidos antigos, carrinhos, avaliações,
 * configurações...). Pedido antigo guarda a foto do item, então ela fica.
 * Arquivos enviados nos últimos 3 dias também ficam (cadastro em andamento).
 *
 * Uso:
 *   node scripts/limpar-fotos-orfas.mjs chave.json            # só lista (dry-run)
 *   node scripts/limpar-fotos-orfas.mjs chave.json --apply    # apaga de fato
 * Precisa de NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET no ambiente.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const keyPath = args.find((a) => !a.startsWith('--'));
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!keyPath || !bucketName) {
  console.error('Uso: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=... node scripts/limpar-fotos-orfas.mjs chave.json [--apply]');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))), storageBucket: bucketName });
const db = getFirestore();
const bucket = getStorage().bucket();
const MIN_AGE_MS = Number(process.env.IDADE_MIN_DIAS ?? 3) * 24 * 60 * 60 * 1000;

// Junta todos os textos de todos os documentos (inclusive subcoleções).
const texts = [];
let docCount = 0;
let productCount = 0;
function collect(v) {
  if (typeof v === 'string') texts.push(v);
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === 'object' && v.constructor?.name === 'Object') Object.values(v).forEach(collect);
}
async function scan(collections) {
  for (const col of collections) {
    const snap = await col.get();
    if (col.path === 'products') productCount = snap.size;
    for (const d of snap.docs) {
      docCount++;
      collect(d.data());
    }
    // listDocuments inclui documentos "fantasma" (só existem por ter
    // subcoleção, ex.: notifications/{uid}), que o get() acima não traz.
    for (const ref of await col.listDocuments()) await scan(await ref.listCollections());
  }
}
await scan(await db.listCollections());
console.log(`[fotos] ${docCount} documento(s) lidos, ${productCount} produto(s).`);
// Trava: se a leitura dos produtos falhou, não apaga nada.
if (productCount === 0) {
  console.error('[fotos] nenhum produto encontrado; abortando por segurança.');
  process.exit(1);
}

// Caminhos referenciados: URL de download (/o/<caminho codificado>?...) ou caminho cru.
const used = new Set();
for (const t of texts) {
  for (const m of t.matchAll(/\/o\/([^?#"'\s]+)/g)) {
    try { used.add(decodeURIComponent(m[1])); } catch { /* ignora */ }
  }
  for (const m of t.matchAll(/products\/[^?#"'\s]+/g)) used.add(m[0]);
}

const [files] = await bucket.getFiles({ prefix: 'products/' });
const now = Date.now();
const orphans = files.filter((f) => {
  if (used.has(f.name)) return false;
  const created = Date.parse(f.metadata.timeCreated ?? '');
  return Number.isFinite(created) && now - created > MIN_AGE_MS;
});
const bytes = orphans.reduce((s, f) => s + Number(f.metadata.size ?? 0), 0);
console.log(`[fotos] ${files.length} arquivo(s) em products/, ${orphans.length} sem uso (${(bytes / 1024 / 1024).toFixed(1)} MB).`);
for (const f of orphans.slice(0, 50)) console.log(`  ${f.name}`);
if (orphans.length > 50) console.log(`  ... e mais ${orphans.length - 50}`);

if (!apply) {
  console.log('[fotos] dry-run: nada foi apagado. Rode com --apply para apagar.');
  process.exit(0);
}
let done = 0;
for (const f of orphans) {
  await f.delete({ ignoreNotFound: true });
  if (++done % 50 === 0) console.log(`[fotos] ${done}/${orphans.length}`);
}
console.log(`[fotos] ${done} arquivo(s) apagado(s).`);
