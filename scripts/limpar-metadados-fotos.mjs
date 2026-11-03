/**
 * Tira os metadados (EXIF com GPS, data, aparelho; XMP) das fotos de
 * produto no Storage, regravando cada imagem pelo sharp.
 *
 * O painel já regrava toda foto num canvas antes de enviar (o que descarta
 * os metadados), mas uma foto enviada direto ao Storage, por fora do
 * painel, chegaria com tudo. Este script pega essas e as antigas.
 *
 * Uso:
 *   node scripts/limpar-metadados-fotos.mjs [chave.json]          # só lista
 *   node scripts/limpar-metadados-fotos.mjs [chave.json] --apply  # regrava
 * Precisa de NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET no ambiente.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const keyPath = args.find((a) => !a.startsWith('--'));
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!bucketName) {
  console.error('Uso: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=... node scripts/limpar-metadados-fotos.mjs [chave.json] [--apply]');
  process.exit(1);
}

// Sem arquivo de chave: credencial do ambiente (no GitHub Actions, a identidade
// federada; ver .github/workflows/limpar-fotos.yml).
const credential = keyPath ? cert(JSON.parse(readFileSync(keyPath, 'utf8'))) : applicationDefault();
initializeApp({ credential, storageBucket: bucketName });
const bucket = getStorage().bucket();

const [files] = await bucket.getFiles({ prefix: 'products/' });
let checked = 0;
let dirty = 0;
let fixed = 0;
for (const file of files) {
  const type = file.metadata.contentType ?? '';
  if (!/^image\/(webp|jpeg|png|gif|avif)$/.test(type)) continue;
  checked++;
  const [buf] = await file.download();
  const meta = await sharp(buf).metadata();
  if (!meta.exif && !meta.xmp && !meta.iptc) continue;
  dirty++;
  console.log(`${apply ? 'limpando' : 'com metadados'}: ${file.name}`);
  if (!apply) continue;
  // rotate() aplica a orientação do EXIF antes de descartá-lo; sem
  // withMetadata(), o sharp não copia EXIF, XMP nem IPTC para a saída.
  const format = meta.format === 'jpeg' ? 'jpeg' : meta.format === 'png' ? 'png' : 'webp';
  const clean = await sharp(buf).rotate().toFormat(format, { quality: 85 }).toBuffer();
  await file.save(clean, {
    resumable: false,
    metadata: {
      contentType: `image/${format}`,
      cacheControl: file.metadata.cacheControl ?? 'public, max-age=31536000, immutable',
      metadata: file.metadata.metadata ?? {},
    },
  });
  fixed++;
}
console.log(`Fotos conferidas: ${checked}. Com metadados: ${dirty}.${apply ? ` Regravadas: ${fixed}.` : ' Rode com --apply para regravar.'}`);
