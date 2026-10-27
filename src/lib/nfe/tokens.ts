import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import type { NfeEnvironment } from './config';

/**
 * Tokens da Focus NFe. Cadastrados pelo painel (só admin) e guardados
 * criptografados (AES-256-GCM) em secureConfig/nfe, coleção que as regras do
 * Firestore não liberam para nenhum cliente. A chave deriva de
 * STAFF_SESSION_SECRET: se ele for trocado, cadastre os tokens de novo.
 * Variáveis de ambiente, se existirem, têm prioridade.
 */

const ENV_VAR: Record<NfeEnvironment, string> = {
  producao: 'FOCUS_NFE_TOKEN_PRODUCAO',
  homologacao: 'FOCUS_NFE_TOKEN_HOMOLOGACAO',
};

const docRef = () => adminDb.collection('secureConfig').doc('nfe');

function key(): Buffer {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) throw new Error('STAFF_SESSION_SECRET não configurado');
  return Buffer.from(hkdfSync('sha256', secret, 'mikma-nfe', 'focus-nfe-token', 32));
}

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}

export function decryptToken(sealed: string): string {
  const [iv, tag, data] = sealed.split('.').map(s => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export async function getFocusToken(env: NfeEnvironment): Promise<string | null> {
  const fromEnv = process.env[ENV_VAR[env]];
  if (fromEnv) return fromEnv;
  const sealed = (await docRef().get()).get(env) as string | undefined;
  if (!sealed) return null;
  try {
    return decryptToken(sealed);
  } catch {
    console.error(`[nfe] token de ${env} não pôde ser lido (STAFF_SESSION_SECRET mudou?)`);
    return null;
  }
}

export async function saveFocusToken(env: NfeEnvironment, token: string | null): Promise<void> {
  await docRef().set({ [env]: token ? encryptToken(token) : null, [`${env}UpdatedAt`]: new Date().toISOString() }, { merge: true });
}

/** Quais ambientes têm token, sem revelar o token. */
export async function tokenStatus(): Promise<Record<NfeEnvironment, boolean>> {
  const data = (await docRef().get()).data() ?? {};
  return {
    producao: !!process.env[ENV_VAR.producao] || !!data.producao,
    homologacao: !!process.env[ENV_VAR.homologacao] || !!data.homologacao,
  };
}
