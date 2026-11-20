import { describe, expect, it } from 'vitest';
import { emailFromHeader, nameFromHeader } from './address';

describe('remetente do e-mail recebido', () => {
  it('nome e endereço', () => {
    expect(emailFromHeader('"Maria Souza" <Maria@Exemplo.com>')).toBe('maria@exemplo.com');
    expect(nameFromHeader('"Maria Souza" <Maria@Exemplo.com>')).toBe('Maria Souza');
    expect(nameFromHeader('Ana <ana@x.com>')).toBe('Ana');
  });

  it('só o endereço', () => {
    expect(emailFromHeader(' ana@x.com ')).toBe('ana@x.com');
    expect(nameFromHeader('ana@x.com')).toBeUndefined();
    expect(nameFromHeader('<ana@x.com>')).toBeUndefined();
    expect(emailFromHeader('<>')).toBe('<>');
  });

  it('entrada maliciosa responde rápido', () => {
    const ruim = '<'.repeat(200_000);
    const t = Date.now();
    emailFromHeader(ruim);
    nameFromHeader(ruim);
    expect(Date.now() - t).toBeLessThan(100);
  });
});
