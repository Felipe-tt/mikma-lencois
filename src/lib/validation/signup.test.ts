import { describe, it, expect } from 'vitest';
import {
  validateName, stripNameChars, validateEmail, suggestEmailFix, normalizeEmail,
  validatePhone, validateCpf,
} from './signup';

describe('validateName', () => {
  it('aceita nomes reais de varios alfabetos', () => {
    for (const n of [
      'Maria da Silva', "João D'Ávila", 'Ana-Maria Souza', 'José Álvaro Jr.', 'Zoë Müller',
      'Nguyễn Văn An', 'Åsa Öberg', 'Мария Иванова', '李 小龙', '山田 太郎',
    ]) {
      expect(validateName(n).ok, n).toBe(true);
    }
  });
  it('rejeita numeros, simbolos, markup e emoji', () => {
    for (const n of ['12345 67890', 'Maria 2 Silva', 'Maria <b>Silva</b>', 'João @ Silva', 'Ana 😀 Lima', 'Maria\u0000 Silva', 'Ana\u200b Lima']) {
      expect(validateName(n).ok, n).toBe(false);
    }
  });
  it('exige nome e sobrenome', () => {
    expect(validateName('Maria').ok).toBe(false);
    expect(validateName('M S').ok).toBe(false);
    expect(validateName('   ').ok).toBe(false);
  });
  it('rejeita repeticao absurda e nome gigante', () => {
    expect(validateName('aaaaaa bbbbbb').ok).toBe(false);
    expect(validateName('A'.repeat(60) + ' ' + 'B'.repeat(60)).ok).toBe(false);
  });
  it('normaliza espacos e Unicode (NFC)', () => {
    const r = validateName('  Maria    da   Silva ');
    expect(r.ok && r.value).toBe('Maria da Silva');
    const nfd = validateName('Jose\u0301 Silva');
    expect(nfd.ok && nfd.value).toBe('José Silva');
  });
  it('stripNameChars remove digitos e simbolos digitados', () => {
    expect(stripNameChars('Mar1a 5ilva')).toBe('Mara ilva');
    expect(stripNameChars('Ana 😀  Lima')).toBe('Ana Lima');
  });
});

describe('validateEmail', () => {
  it('aceita e-mails validos e normaliza', () => {
    for (const e of ['a@b.co', 'maria.silva+loja@gmail.com', 'x_y-z@sub.exemplo.com.br']) {
      expect(validateEmail(e).ok, e).toBe(true);
    }
    const r = validateEmail('  Maria@Gmail.COM ');
    expect(r.ok && r.value).toBe('maria@gmail.com');
    expect(normalizeEmail(' A@B.Com ')).toBe('a@b.com');
  });
  it('rejeita e-mails invalidos', () => {
    for (const e of [
      '', 'maria', 'maria@', '@gmail.com', 'maria@gmail', 'maria@gmail.', 'maria@.com',
      'maria..silva@gmail.com', '.maria@gmail.com', 'ma ria@gmail.com',
      'maria@@gmail.com', 'maria@gmail..com', 'maria@-gmail.com', 'maria@gmail.c',
      'maria@gmail.123', 'a@b.com;c@d.com', '<x>@gmail.com', 'João <joao@gmail.com>',
      'maria@[127.0.0.1]', 'jose@gmail.com\r\nBcc: x@y.com',
    ]) {
      expect(validateEmail(e).ok, e).toBe(false);
    }
    expect(validateEmail('a'.repeat(65) + '@gmail.com').ok).toBe(false);
  });
});

describe('suggestEmailFix', () => {
  it('sugere correcao de erro de digitacao', () => {
    expect(suggestEmailFix('maria@gmial.com')).toBe('maria@gmail.com');
    expect(suggestEmailFix('maria@hotmal.com')).toBe('maria@hotmail.com');
    expect(suggestEmailFix('maria@gmail.con')).toBe('maria@gmail.com');
  });
  it('nao sugere nada para dominios corretos, inclusive brasileiros', () => {
    for (const e of ['maria@gmail.com', 'a@uol.com.br', 'a@uol.com', 'a@empresa.com.br', 'a@bol.com.br', 'sem-arroba']) {
      expect(suggestEmailFix(e), e).toBeNull();
    }
  });
});

describe('validatePhone', () => {
  it('vazio e permitido (campo opcional)', () => {
    expect(validatePhone('')).toEqual({ ok: true, value: '' });
  });
  it('aceita celular e fixo brasileiros e devolve so digitos', () => {
    expect(validatePhone('(47) 99999-1234')).toEqual({ ok: true, value: '47999991234' });
    expect(validatePhone('(47) 3322-1234')).toEqual({ ok: true, value: '4733221234' });
    expect(validatePhone('+55 47 99999-1234')).toEqual({ ok: true, value: '47999991234' });
  });
  it('rejeita DDD inexistente, numero curto e numero de outro pais', () => {
    for (const p of ['(00) 99999-1234', '(10) 99999-1234', '123', '(47) 9999-12', '+1 415 555 2671', 'abc']) {
      expect(validatePhone(p).ok, p).toBe(false);
    }
  });
});

describe('validateCpf', () => {
  it('valida digitos verificadores', () => {
    expect(validateCpf('529.982.247-25')).toEqual({ ok: true, value: '52998224725' });
    expect(validateCpf('111.111.111-11').ok).toBe(false);
    expect(validateCpf('529.982.247-24').ok).toBe(false);
    expect(validateCpf('123').ok).toBe(false);
    expect(validateCpf('')).toEqual({ ok: true, value: '' });
  });
});
