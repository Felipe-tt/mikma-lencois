import { describe, it, expect } from 'vitest';
import {
  maskCep, maskCpf, maskCnpj, maskPhone, onlyDigits,
  isValidCpf, isValidCnpj, isValidCep, isValidPhone,
} from './masks';

describe('maskCep', () => {
  it('formata CEP completo', () => {
    expect(maskCep('01310100')).toBe('01310-100');
  });
  it('formata parcialmente enquanto digita', () => {
    expect(maskCep('0131')).toBe('0131');
  });
  it('ignora caracteres não numéricos e trunca em 8 dígitos', () => {
    expect(maskCep('01310-100extra')).toBe('01310-100');
  });
});

describe('maskCpf', () => {
  it('formata CPF completo', () => {
    expect(maskCpf('11144477735')).toBe('111.444.777-35');
  });
  it('formata parcialmente', () => {
    expect(maskCpf('111444')).toBe('111.444');
  });
});

describe('maskCnpj', () => {
  it('formata CNPJ completo', () => {
    expect(maskCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('formata parcialmente', () => {
    expect(maskCnpj('11222333')).toBe('11.222.333');
  });
});

describe('maskPhone', () => {
  it('formata celular (11 dígitos)', () => {
    expect(maskPhone('47999998888')).toBe('(47) 99999-8888');
  });
  it('formata fixo (10 dígitos)', () => {
    expect(maskPhone('4733334444')).toBe('(47) 3333-4444');
  });
});

describe('onlyDigits', () => {
  it('remove tudo que não é dígito', () => {
    expect(onlyDigits('(47) 99999-8888')).toBe('47999998888');
  });
});

describe('isValidCpf', () => {
  it('aceita CPF válido', () => {
    expect(isValidCpf('111.444.777-35')).toBe(true);
  });
  it('rejeita CPF com dígito verificador errado', () => {
    expect(isValidCpf('111.444.777-36')).toBe(false);
  });
  it('rejeita sequência de dígitos repetidos (formalmente "válida" na conta, mas é fraude comum)', () => {
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });
  it('rejeita tamanho errado', () => {
    expect(isValidCpf('123')).toBe(false);
  });
});

describe('isValidCnpj', () => {
  it('aceita CNPJ válido', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });
  it('rejeita CNPJ com dígito verificador errado', () => {
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
  });
  it('rejeita sequência de dígitos repetidos', () => {
    expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
  });
  it('rejeita tamanho errado', () => {
    expect(isValidCnpj('123')).toBe(false);
  });
});

describe('isValidCep', () => {
  it('aceita 8 dígitos', () => expect(isValidCep('01310-100')).toBe(true));
  it('rejeita tamanho errado', () => expect(isValidCep('123')).toBe(false));
});

describe('isValidPhone', () => {
  it('aceita 10 dígitos (fixo)', () => expect(isValidPhone('4733334444')).toBe(true));
  it('aceita 11 dígitos (celular)', () => expect(isValidPhone('47999998888')).toBe(true));
  it('rejeita 9 dígitos', () => expect(isValidPhone('473333444')).toBe(false));
});
