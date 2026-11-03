import { beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';

const DELETE = Symbol('delete');
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => DELETE } }));

beforeAll(() => { process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64'); });

const { cpfBlindIndex, decryptPii, encryptPii, piiPatch, readPii, withPii } = await import('./piiCrypto');

describe('criptografia de CPF e telefone', () => {
  it('cifra e decifra; o valor gravado não contém o dado', () => {
    const enc = encryptPii('52998224725');
    expect(enc.startsWith('enc1:')).toBe(true);
    expect(enc).not.toContain('52998224725');
    expect(decryptPii(enc)).toBe('52998224725');
  });

  it('cada gravação usa um IV novo (o mesmo CPF não gera o mesmo texto)', () => {
    expect(encryptPii('52998224725')).not.toBe(encryptPii('52998224725'));
  });

  it('valor adulterado é recusado (GCM autentica)', () => {
    const enc = encryptPii('47999990000');
    const [iv, data, tag] = enc.slice(5).split('.');
    const flipped = Buffer.from(data, 'base64url'); flipped[0] ^= 1;
    expect(() => decryptPii(`enc1:${iv}.${flipped.toString('base64url')}.${tag}`)).toThrow();
  });

  it('perfil antigo em claro continua legível', () => {
    expect(decryptPii('52998224725')).toBe('52998224725');
    expect(readPii({ cpf: '52998224725', phone: '47999990000' })).toEqual({ cpf: '52998224725', phone: '47999990000' });
    expect(readPii(undefined)).toEqual({ cpf: '', phone: '' });
  });

  it('o campo criptografado tem prioridade sobre o antigo', () => {
    const p = { cpf: '11111111111', cpfEnc: encryptPii('52998224725'), name: 'Ana' };
    expect(withPii(p)).toMatchObject({ name: 'Ana', cpf: '52998224725', phone: '' });
  });

  it('o HMAC do CPF é estável, ignora pontuação e não revela o CPF', () => {
    expect(cpfBlindIndex('529.982.247-25')).toBe(cpfBlindIndex('52998224725'));
    expect(cpfBlindIndex('52998224725')).not.toContain('52998224725');
    expect(cpfBlindIndex('52998224725')).not.toBe(cpfBlindIndex('11144477735'));
  });

  it('piiPatch grava cifrado e apaga o campo em claro', () => {
    const patch = piiPatch({ cpf: '529.982.247-25', phone: '(47) 99999-0000' });
    expect(decryptPii(patch.cpfEnc)).toBe('52998224725');
    expect(decryptPii(patch.phoneEnc)).toBe('47999990000');
    expect(patch.cpfHash).toBe(cpfBlindIndex('52998224725'));
    expect(patch.cpf).toBe(DELETE);
    expect(patch.phone).toBe(DELETE);
  });

  it('piiPatch com valor vazio apaga; em documento novo só grava o preenchido', () => {
    expect(piiPatch({ phone: '' })).toEqual({ phoneEnc: DELETE, phone: DELETE });
    expect(piiPatch({ cpf: undefined, phone: '47999990000' }, { newDoc: true })).toEqual({ phoneEnc: expect.stringMatching(/^enc1:/) });
  });

  it('sem chave configurada não grava nada em claro: falha', () => {
    const k = process.env.PII_ENCRYPTION_KEY;
    delete process.env.PII_ENCRYPTION_KEY;
    try { expect(() => encryptPii('1')).toThrow(/PII_ENCRYPTION_KEY/); }
    finally { process.env.PII_ENCRYPTION_KEY = k; }
  });
});
