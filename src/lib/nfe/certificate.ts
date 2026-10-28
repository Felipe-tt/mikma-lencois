import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import forge from 'node-forge';
import { adminDb } from '@/lib/firebase/admin';

/**
 * Certificado digital A1 (.pfx) da empresa, importado pelo painel (só admin).
 * Guardado criptografado (AES-256-GCM) em secureConfig/nfeCert, coleção que
 * as regras do Firestore não liberam para nenhum cliente. A chave deriva de
 * STAFF_SESSION_SECRET: se ele for trocado, importe o certificado de novo.
 * Sem certificado, nenhuma nota é gerada.
 */

export interface CertInfo {
  titular: string;
  cnpj: string | null;
  validFrom: string;
  validTo: string;
}

export class CertificateError extends Error {}

const docRef = () => adminDb.collection('secureConfig').doc('nfeCert');

function key(): Buffer {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) throw new Error('STAFF_SESSION_SECRET não configurado');
  return Buffer.from(hkdfSync('sha256', secret, 'mikma-nfe', 'certificado-a1', 32));
}

export function seal(data: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}

export function unseal(sealed: string): Buffer {
  const [iv, tag, enc] = sealed.split('.').map(s => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

/** Abre o .pfx com a senha e devolve titular, CNPJ e validade. Lança CertificateError. */
export function readCertificate(pfx: Buffer, password: string): CertInfo {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString('binary')), password);
  } catch {
    throw new CertificateError('Não foi possível abrir o certificado. Confira o arquivo .pfx e a senha.');
  }
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  if (keyBags.length === 0) throw new CertificateError('O arquivo não tem a chave privada. Exporte o certificado A1 completo (.pfx).');
  // O certificado da empresa é o que não é de autoridade certificadora.
  const cert = certBags.map(b => b.cert).find(c => c && !c.extensions.some(e => e.name === 'basicConstraints' && e.cA)) ?? certBags[0]?.cert;
  if (!cert) throw new CertificateError('Nenhum certificado encontrado no arquivo.');
  const cn = String(cert.subject.getField('CN')?.value ?? '');
  // e-CNPJ: o CN termina com ":<CNPJ>" (padrão ICP-Brasil).
  const cnpj = cn.match(/:(\d{14})\s*$/)?.[1] ?? null;
  return {
    titular: cn.replace(/:\d{14}\s*$/, '').trim() || cn,
    cnpj,
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
  };
}

export async function saveCertificate(pfx: Buffer, password: string, expectedCnpj: string): Promise<CertInfo> {
  const info = readCertificate(pfx, password);
  if (Date.parse(info.validTo) < Date.now()) throw new CertificateError(`Este certificado venceu em ${new Date(info.validTo).toLocaleDateString('pt-BR')}.`);
  if (info.cnpj && expectedCnpj && info.cnpj !== expectedCnpj) {
    throw new CertificateError(`O certificado é do CNPJ ${info.cnpj}, mas a loja está configurada com ${expectedCnpj}.`);
  }
  await docRef().set({ pfx: seal(pfx), password: seal(Buffer.from(password, 'utf8')), info, updatedAt: new Date().toISOString() });
  return info;
}

export async function removeCertificate(): Promise<void> {
  await docRef().delete();
}

export async function certificateInfo(): Promise<CertInfo | null> {
  const data = (await docRef().get()).data();
  return (data?.info as CertInfo | undefined) ?? null;
}

/** Certificado pronto para assinar, ou null se não houver (ou não der para abrir). */
export async function loadCertificate(): Promise<{ pfx: Buffer; password: string; info: CertInfo } | null> {
  const data = (await docRef().get()).data();
  if (!data?.pfx || !data.password) return null;
  try {
    return { pfx: unseal(data.pfx), password: unseal(data.password).toString('utf8'), info: data.info as CertInfo };
  } catch {
    console.error('[nfe] certificado não pôde ser lido (STAFF_SESSION_SECRET mudou?)');
    return null;
  }
}
