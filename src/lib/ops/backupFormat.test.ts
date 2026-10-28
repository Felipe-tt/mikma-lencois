import { describe, expect, it } from 'vitest';
import { decodeValue, encodeValue, open, seal, SKIP_COLLECTIONS } from '../../../scripts/lib/backup-format.mjs';

const KEY = 'senha-de-teste-bem-longa-123';

describe('formato do backup do Firestore', () => {
  it('criptografa, comprime e abre de volta igual', () => {
    const ndjson = Array.from({ length: 200 }, (_, i) => JSON.stringify({ p: `orders/o${i}`, d: { total: i, nome: 'Lençol Casal Malha' } })).join('\n');
    const file = seal(ndjson, KEY);
    expect(file.subarray(0, 8).toString()).toBe('MIKMABK1');
    expect(file.length).toBeLessThan(ndjson.length / 5); // gzip
    expect(file.toString('latin1')).not.toContain('Lençol'); // ilegível sem a senha
    expect(open(file, KEY)).toBe(ndjson);
  });

  it('senha errada ou arquivo alterado é recusado', () => {
    const file = seal('{"p":"a/b","d":{}}', KEY);
    expect(() => open(file, 'outra-senha-bem-longa-999')).toThrow(/Senha do backup errada/);
    const tampered = Buffer.from(file); tampered[tampered.length - 1] ^= 1;
    expect(() => open(tampered, KEY)).toThrow(/Senha do backup errada/);
    expect(() => seal('x', 'curta')).toThrow(/16 caracteres/);
  });

  it('mantém os tipos do Firestore', () => {
    const ts = { seconds: 1793200000, nanoseconds: 5, toDate: () => new Date() };
    const geo = { latitude: -26.9, longitude: -49.07, isEqual: () => true };
    const enc = encodeValue({ ts, geo, ref: { path: 'products/p1', firestore: {} }, b: Buffer.from('oi'), lista: [ts], n: null });
    expect(enc).toEqual({
      ts: { __t: 'ts', s: 1793200000, n: 5 }, geo: { __t: 'geo', lat: -26.9, lng: -49.07 },
      ref: { __t: 'ref', path: 'products/p1' }, b: { __t: 'bytes', b64: 'b2k=' }, lista: [{ __t: 'ts', s: 1793200000, n: 5 }], n: null,
    });
    const dec = decodeValue(JSON.parse(JSON.stringify(enc)), {
      timestamp: (s: number, n: number) => `ts:${s}.${n}`, geoPoint: (a: number, b: number) => `geo:${a},${b}`, ref: (p: string) => `ref:${p}`,
    });
    expect(dec).toMatchObject({ ts: 'ts:1793200000.5', geo: 'geo:-26.9,-49.07', ref: 'ref:products/p1', lista: ['ts:1793200000.5'] });
    expect(Buffer.from(dec.b).toString()).toBe('oi');
  });

  it('coleções descartáveis ficam de fora, as da loja não', () => {
    expect(SKIP_COLLECTIONS.has('password_resets')).toBe(true);
    expect(SKIP_COLLECTIONS.has('webauthnChallenges')).toBe(true);
    for (const c of ['orders', 'products', 'users', 'secureConfig', 'inventory', 'passkeys']) expect(SKIP_COLLECTIONS.has(c)).toBe(false);
  });
});
