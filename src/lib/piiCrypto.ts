import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * CPF e telefone criptografados no Firestore (AES-256-GCM). Um vazamento do
 * banco, ou de um backup, não expõe esses dados: sem a chave
 * (PII_ENCRYPTION_KEY, no Secret Manager) o valor gravado é ilegível.
 *
 * No perfil (users/{uid}) ficam:
 * - cpfEnc / phoneEnc: o valor criptografado ("enc1:<iv>.<dados>.<tag>");
 * - cpfHash: HMAC do CPF, para achar contas com o mesmo CPF (detector de
 *   golpe) sem guardar o CPF em claro.
 * Perfis antigos ainda podem ter cpf/phone em claro: são lidos normalmente e
 * convertidos pela rotina de retenção (migrateLegacyPii).
 *
 * Só o servidor lê e grava esses campos; as regras do Firestore recusam o
 * cliente.
 */

const PREFIX = 'enc1:';

function key(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) throw new Error('PII_ENCRYPTION_KEY não configurada');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('PII_ENCRYPTION_KEY precisa ter 32 bytes (base64)');
  return k;
}

const b64 = (b: Buffer) => b.toString('base64url');

export function encryptPii(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${b64(iv)}.${b64(data)}.${b64(cipher.getAuthTag())}`;
}

/** Abre o valor criptografado. Valor sem o prefixo (perfil antigo) volta como está. */
export function decryptPii(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  if (!value.startsWith(PREFIX)) return value;
  const [iv, data, tag] = value.slice(PREFIX.length).split('.').map(p => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** HMAC do CPF (só dígitos): igual para o mesmo CPF, sem revelar qual é. */
export function cpfBlindIndex(cpf: string): string {
  return createHmac('sha256', key()).update(`cpf:${cpf.replace(/\D/g, '')}`).digest('base64url');
}

/** CPF e telefone de um perfil, já abertos (aceita perfil antigo, em claro). */
export function readPii(profile: Record<string, unknown> | undefined | null): { cpf: string; phone: string } {
  const p = profile ?? {};
  return {
    cpf: decryptPii(p.cpfEnc ?? p.cpf),
    phone: decryptPii(p.phoneEnc ?? p.phone),
  };
}

/** O perfil com cpf e phone já abertos, para quem só lê esses dois campos. */
export function withPii<T extends Record<string, unknown>>(profile: T | undefined | null): T & { cpf: string; phone: string } {
  return { ...(profile ?? ({} as T)), ...readPii(profile) };
}

/**
 * Campos para gravar CPF e/ou telefone num perfil. Com merge (padrão), valor
 * vazio apaga e a versão antiga em claro é removida. Para um perfil novo
 * (set sem merge), use { newDoc: true }: só grava o que veio preenchido.
 */
export function piiPatch(values: { cpf?: string; phone?: string }, { newDoc = false } = {}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const del = () => FieldValue.delete();
  if (values.cpf !== undefined) {
    const cpf = values.cpf.replace(/\D/g, '');
    if (cpf) { patch.cpfEnc = encryptPii(cpf); patch.cpfHash = cpfBlindIndex(cpf); }
    else if (!newDoc) { patch.cpfEnc = del(); patch.cpfHash = del(); }
    if (!newDoc) patch.cpf = del();
  }
  if (values.phone !== undefined) {
    const phone = values.phone.replace(/\D/g, '');
    if (phone) patch.phoneEnc = encryptPii(phone);
    else if (!newDoc) patch.phoneEnc = del();
    if (!newDoc) patch.phone = del();
  }
  return patch;
}
