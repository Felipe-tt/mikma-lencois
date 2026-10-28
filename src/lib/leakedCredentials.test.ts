import { describe, expect, it } from 'vitest';
import { passwordLeaked } from './leakedCredentials';

describe('passwordLeaked', () => {
  it('pede confirmação quando a senha vazou', () => {
    for (const v of ['1', '2', '4']) expect(passwordLeaked(v)).toBe(true);
  });
  it('ignora só e-mail vazado, ausência e lixo', () => {
    for (const v of ['3', null, '', '0', 'x']) expect(passwordLeaked(v)).toBe(false);
  });
});
