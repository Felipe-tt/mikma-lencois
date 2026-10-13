import { describe, it, expect } from 'vitest';
import {
  validateName, stripNameChars, validateEmail, suggestEmailFix,
  validatePassword, validatePhone, validateCpf,
} from './signup';

const okVal = (r: { ok: boolean }) => r.ok;

describe('validateName', () => {
  it('aceita nomes brasileiros comuns', () => {
    for (const n of ['Maria da Silva', 'João D\'Ávila', 'Ana-Maria Souza', 'José Álvaro Jr.', 'Zoë Müller']) {
      expect(okVal(validateName(n)), n).toBe(true);
    }
  });
  it('rejeita números e símbolos', () => {
    for (const n of ['12345 67890', 'Maria 2 Silva', 'Maria <b>Silva</b>', 'João @ Silva', 'Ana 😀 Lima']) {
      expect(okVal(validateName(n)), n).toBe(false);
    }
  });
  it('exige nome e sobrenome', () => {
    expect(okVal(validateName('Maria'))).toBe(false);
    expect(okVal(validateName('M S'))).toBe(false);
    expect(okVal(validateName('   '))).toBe(false);
  });
  it('rejeita repetição absurda e nome gigante', () => {
    expect(okVal(validateName('aaaaaa bbbbbb'))).toBe(false);
    expect(okVal(validateName('A'.repeat(60) + ' ' + 'B'.repeat(60)))).toBe(false);
  });
  it('normaliza espaços', () => {
    const r = validateName('  Maria    da   Silva ');
    expect(r.ok && r.value).toBe('Maria da Silva');
  });
  it('stripNameChars remove dígitos digitados', () => {
    expect(stripNameChars('Mar1a 5ilva')).toBe('Mara ilva');
  });
});

describe('validateEmail', () => {
  it('aceita e-mails válidos e normaliza', () => {
    for (const e of ['a@b.co', 'maria.silva+loja@gmail.com', 'x_y-z@sub.exemplo.com.br']) {
      expect(okVal(validateEmail(e)), e).toBe(true);
    }
    const r = validateEmail('  Maria@Gmail.COM ');
    expect(r.ok && r.value).toBe('maria@gmail.com');
  });
  it('rejeita e-mails inválidos', () => {
    for (const e of [
      '', 'maria', 'maria@', '@gmail.com', 'maria@gmail', 'maria@gmail.', 'maria@.com',
      'maria..silva@gmail.com', '.maria@gmail.com', 'maria.@gmail.com', 'ma ria@gmail.com',
      'maria@@gmail.com', 'maria@gmail..com', 'maria@-gmail.com', 'maria@gmail.c',
      'maria@gmail.123', 'a@b.com;c@d.com', '<x>@gmail.com',
    ]) {
      expect(okVal(validateEmail(e)), e).toBe(false);
    }
  });
  it('limita tamanho', () => {
    expect(okVal(validateEmail('a'.repeat(65) + '@gmail.com'))).toBe(false);
  });
  it('sugere correção de domínio', () => {
    expect(suggestEmailFix('maria@gmial.com')).toBe('maria@gmail.com');
    expect(suggestEmailFix('maria@gmail.com')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('aceita senha razoável', () => {
    expect(okVal(validatePassword('Lencol2026!'))).toBe(true);
    expect(okVal(validatePassword('frase longa com 3 palavras'))).toBe(true);
  });
  it('rejeita curta, sem número, sem letra, comum e repetida', () => {
    for (const p of ['abc12', 'somenteletras', '1234567890123', '12345678', 'Senha123'.replace('Senha123', 'password1'), 'aaaaaaaa']) {
      expect(okVal(validatePassword(p)), p).toBe(false);
    }
  });
  it('rejeita espaço nas pontas e senha gigante', () => {
    expect(okVal(validatePassword(' abcdefg1'))).toBe(false);
    expect(okVal(validatePassword('a1' + 'x'.repeat(200)))).toBe(false);
  });
  it('rejeita senha que contém o e-mail', () => {
    expect(okVal(validatePassword('maria.silva1', 'maria.silva@gmail.com'))).toBe(false);
  });
});

describe('validatePhone e validateCpf', () => {
  it('telefone vazio é permitido (campo opcional)', () => {
    expect(validatePhone('')).toEqual({ ok: true, value: '' });
  });
  it('aceita celular e fixo válidos', () => {
    expect(okVal(validatePhone('(47) 99999-1234'))).toBe(true);
    expect(okVal(validatePhone('(47) 3322-1234'))).toBe(true);
  });
  it('rejeita DDD inválido, celular sem 9 e repetidos', () => {
    for (const p of ['(00) 99999-1234', '(10) 99999-1234', '(47) 89999-1234', '(47) 99999-9999', '123']) {
      expect(okVal(validatePhone(p)), p).toBe(false);
    }
  });
  it('CPF valida dígitos verificadores', () => {
    expect(okVal(validateCpf('529.982.247-25'))).toBe(true);
    expect(okVal(validateCpf('111.111.111-11'))).toBe(false);
    expect(okVal(validateCpf('529.982.247-24'))).toBe(false);
    expect(validateCpf('')).toEqual({ ok: true, value: '' });
  });
});
