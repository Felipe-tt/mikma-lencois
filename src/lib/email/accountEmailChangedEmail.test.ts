import { describe, expect, it } from 'vitest';
import { accountEmailChangedEmail, maskEmail } from './accountEmailChangedEmail';

describe('aviso de e-mail trocado fora do site', () => {
  it('mostra o e-mail novo mascarado, a hora e o que fazer', () => {
    const { subject, html, text } = accountEmailChangedEmail({ newEmail: 'invasor@gmail.com', when: new Date('2026-11-22T04:10:00Z') });
    expect(subject).toBe('O e-mail da sua conta na Mikma foi trocado');
    for (const out of [html, text]) {
      expect(out).toContain('in***@gmail.com');
      expect(out).not.toContain('invasor@gmail.com');
      expect(out).toContain('22/11/2026, 01:10 (horário de Brasília)');
      expect(out).toContain('travamos a conta');
      expect(out).toContain('Não foi você?');
    }
  });

  it('máscara não deixa passar HTML nem quebra com e-mail estranho', () => {
    expect(maskEmail('a@b.com')).toBe('a***@b.com');
    expect(maskEmail('semarroba')).toBe('***');
    expect(accountEmailChangedEmail({ newEmail: '<b>x@y.com', when: new Date() }).html).not.toContain('<b>x');
  });
});
