/**
 * Formato do backup do Firestore (scripts/firestore-backup.mjs e
 * firestore-restore.mjs). Puro (sem Firestore), para testar.
 *
 * Arquivo: "MIKMABK1" + salt(16) + iv(12) + tag(16) + AES-256-GCM(gzip(NDJSON)).
 * Cada linha do NDJSON é {"p": "colecao/doc/sub/doc", "d": {...}}, com os
 * tipos do Firestore marcados para voltarem iguais no restore.
 * A chave vem da senha BACKUP_KEY (scrypt): sem ela, o arquivo é ilegível,
 * então pode ficar como artifact do GitHub mesmo com o repositório público.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

const MAGIC = Buffer.from('MIKMABK1');

/** Coleções descartáveis: códigos temporários, cache e filas. */
export const SKIP_COLLECTIONS = new Set([
  'maintenance_queue', 'password_resets', 'login_challenges', 'email_verifications',
  'webauthnChallenges', 'geocache', '_cache', 'trackingCache', 'webhook_deliveries',
  'rateLimits', 'whatsappAuth', 'whatsappAuthKeys',
]);

/** Firestore -> JSON, marcando Timestamp, GeoPoint, referência e bytes. */
export function encodeValue(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(encodeValue);
  if (typeof v.toDate === 'function' && 'seconds' in v && 'nanoseconds' in v) return { __t: 'ts', s: v.seconds, n: v.nanoseconds };
  if ('latitude' in v && 'longitude' in v && typeof v.isEqual === 'function') return { __t: 'geo', lat: v.latitude, lng: v.longitude };
  if (typeof v.path === 'string' && v.firestore) return { __t: 'ref', path: v.path };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __t: 'bytes', b64: Buffer.from(v).toString('base64') };
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = encodeValue(x);
  return out;
}

/** JSON -> Firestore. `make` cria os tipos do SDK (Timestamp, GeoPoint, doc). */
export function decodeValue(v, make) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => decodeValue(x, make));
  switch (v.__t) {
    case 'ts': return make.timestamp(v.s, v.n);
    case 'geo': return make.geoPoint(v.lat, v.lng);
    case 'ref': return make.ref(v.path);
    case 'bytes': return Buffer.from(v.b64, 'base64');
  }
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = decodeValue(x, make);
  return out;
}

function keyFrom(password, salt) {
  if (!password || password.length < 16) throw new Error('BACKUP_KEY precisa ter pelo menos 16 caracteres');
  return scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

/** Linhas NDJSON -> arquivo comprimido e criptografado. */
export function seal(ndjson, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(password, salt), iv);
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(ndjson, 'utf8'), { level: 9 })), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

/** Arquivo -> NDJSON. Lança erro se a senha estiver errada ou o arquivo corrompido. */
export function open(file, password) {
  if (!file.subarray(0, 8).equals(MAGIC)) throw new Error('Não é um backup da Mikma (cabeçalho inválido)');
  const salt = file.subarray(8, 24);
  const iv = file.subarray(24, 36);
  const tag = file.subarray(36, 52);
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(password, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return gunzipSync(Buffer.concat([decipher.update(file.subarray(52)), decipher.final()])).toString('utf8');
  } catch {
    throw new Error('Senha do backup errada ou arquivo corrompido');
  }
}
