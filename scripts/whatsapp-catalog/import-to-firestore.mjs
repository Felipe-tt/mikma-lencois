#!/usr/bin/env node
// scripts/whatsapp-catalog/import-to-firestore.mjs
//
// Lê o catalogo.csv (já revisado e completado por você) e cria os produtos
// no Firestore do site — do mesmo jeito que /painel/produtos/novo faria,
// incluindo o registro inicial de estoque (quantidade 0) para cada variação.
//
// COMO USAR:
//   cd scripts/whatsapp-catalog
//   npm install                      (se ainda não rodou)
//   npm run import -- --file=./catalogo-whatsapp/catalogo.csv --dry-run
//   npm run import -- --file=./catalogo-whatsapp/catalogo.csv
//
// Sempre rode primeiro com --dry-run pra ver o que seria criado, sem
// gravar nada ainda.
//
// PRECISA: das mesmas variáveis de ambiente do site, lidas automaticamente
// do arquivo .env.local na raiz do repo (o mesmo que o `npm run dev` usa):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
//   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

// Precisam ser EXATAMENTE iguais ao que está em src/components/seller/ProductForm.tsx
const CATEGORIES = ['Lençóis', 'Fronhas', 'Edredons', 'Travesseiros', 'Jogos de cama', 'Outros'];
const SIZES = ['solteiro', 'casal', 'queen', 'king'];
const FABRICS = ['Algodão', 'Malha', 'Percal 200 fios', 'Percal 300 fios', 'Cetim'];

const args = process.argv.slice(2);
const fileArg = args.find((a) => a.startsWith('--file='));
const csvPath = fileArg ? path.resolve(fileArg.split('=')[1]) : path.join(__dirname, 'catalogo-whatsapp', 'catalogo.csv');
const dryRun = args.includes('--dry-run');
const sellerUid = process.env.WHATSAPP_IMPORT_SELLER_UID || 'whatsapp-import';

if (!fs.existsSync(csvPath)) {
  console.error('Arquivo não encontrado:', csvPath);
  process.exit(1);
}

let db, bucket;
if (!dryRun) {
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error('Faltam variáveis do Firebase Admin (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).');
    console.error('Confirme que existe um .env.local na raiz do repo com essas variáveis (o mesmo arquivo usado pelo `npm run dev`).');
    console.error('(Sem essas variáveis só dá pra rodar com --dry-run, que não grava nada.)');
    process.exit(1);
  }

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
  db = getFirestore(app);
  bucket = getStorage(app).bucket();
}

function makeVariantId(size, fabric) {
  return `${size}_${fabric}`.toLowerCase().replace(/\s+/g, '_');
}

function parsePriceToCents(raw) {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(',', '.'));
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}

async function uploadImage(localPath) {
  const abs = path.isAbsolute(localPath) ? localPath : path.join(__dirname, 'catalogo-whatsapp', localPath);
  if (!fs.existsSync(abs)) return null;
  const ext = path.extname(abs) || '.jpg';
  const token = crypto.randomUUID();
  const now = new Date();
  const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  const destination = `products/${folder}/whatsapp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;

  await bucket.upload(abs, {
    destination,
    metadata: {
      contentType: ext === '.png' ? 'image/png' : 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;
}

async function main() {
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true });

  console.log(`Lidas ${records.length} linha(s) de ${csvPath}${dryRun ? '  [DRY RUN — nada será gravado]' : ''}\n`);

  let created = 0;
  let skipped = 0;

  for (const [i, row] of records.entries()) {
    const errors = [];
    const name = (row.nome || '').trim();
    const priceCents = parsePriceToCents(row.preco);
    const category = (row.categoria || '').trim();
    const size = (row.tamanho || '').trim();
    const fabric = (row.tecido || '').trim();
    const weightKg = parseFloat(String(row.peso_kg || '').replace(',', '.'));
    const localImages = (row.imagens_locais || '').split(';').map((s) => s.trim()).filter(Boolean);

    if (!name) errors.push('sem nome');
    if (!priceCents) errors.push('preço inválido/vazio (coluna "preco")');
    if (!category) errors.push('categoria vazia');
    else if (!CATEGORIES.includes(category)) errors.push(`categoria "${category}" inválida — use uma de: ${CATEGORIES.join(', ')}`);
    if (!size) errors.push('tamanho vazio');
    else if (!SIZES.includes(size)) errors.push(`tamanho "${size}" inválido — use um de: ${SIZES.join(', ')}`);
    if (!fabric) errors.push('tecido vazio');
    else if (!FABRICS.includes(fabric)) errors.push(`tecido "${fabric}" inválido — use um de: ${FABRICS.join(', ')}`);
    if (!weightKg || Number.isNaN(weightKg)) errors.push('peso_kg vazio/inválido');
    if (localImages.length === 0) errors.push('sem imagens locais (coluna "imagens_locais")');

    if (errors.length > 0) {
      console.warn(`[${i + 1}] PULADO "${name || '(sem nome)'}": ${errors.join('; ')}`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[${i + 1}] OK (dry-run) "${name}" — ${category}/${size}/${fabric} — R$ ${(priceCents / 100).toFixed(2)} — ${localImages.length} imagem(ns)`);
      created++;
      continue;
    }

    const imageUrls = [];
    for (const local of localImages) {
      const url = await uploadImage(local);
      if (url) imageUrls.push(url);
      else console.warn(`   (aviso) não encontrei o arquivo de imagem: ${local}`);
    }
    if (imageUrls.length === 0) {
      console.warn(`[${i + 1}] PULADO "${name}": nenhuma imagem pôde ser enviada ao Storage`);
      skipped++;
      continue;
    }

    const variant = {
      id: makeVariantId(size, fabric),
      size,
      fabric,
      color: (row.cor_hex || '').trim(),
      colorName: (row.cor_nome || row.cor_hex || '').trim(),
    };

    const ref = db.collection('products').doc();
    await ref.set({
      name,
      description: row.descricao || '',
      price: priceCents,
      weightKg,
      images: imageUrls,
      category,
      tags: [],
      variants: [variant],
      active: (row.ativo || 'sim').toLowerCase() !== 'não',
      sellerId: sellerUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('inventory').doc(`${ref.id}_${variant.id}`).set({
      productId: ref.id,
      variant,
      quantity: 0,
      reserved: 0,
      lowStockThreshold: 5,
      history: [],
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`[${i + 1}] CRIADO "${name}" → produto ${ref.id}`);
    created++;
  }

  console.log(`\nResumo: ${created} ${dryRun ? 'OK (dry-run)' : 'criado(s)'}, ${skipped} pulado(s).`);
  if (skipped > 0) {
    console.log('Corrija as linhas puladas no CSV (categoria/tamanho/tecido precisam ser EXATAMENTE um dos valores válidos) e rode de novo.');
  }
  if (!dryRun && created > 0) {
    console.log(`\nLembrete: os produtos criados começam com estoque ZERADO em todas as variações. Ajuste a quantidade em /painel/produtos antes de divulgar.`);
  }
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
