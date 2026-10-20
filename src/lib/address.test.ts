import { describe, it, expect } from 'vitest';
import { toAddress, streetLine, cityLine } from './address';

describe('toAddress', () => {
  it('endereço em texto (formato antigo) vira null', () => {
    expect(toAddress('Rua X, 10')).toBeNull();
    expect(toAddress(null)).toBeNull();
    expect(toAddress(['a'])).toBeNull();
  });
  it('completa campos que faltam com texto vazio', () => {
    const a = toAddress({ street: 'Rua X', city: 'Blumenau', state: 'SC', number: 12 });
    expect(a).toEqual({ cep: '', street: 'Rua X', number: '', complement: '', neighborhood: '', city: 'Blumenau', state: 'SC' });
  });
  it('objeto sem nenhum campo útil vira null', () => {
    expect(toAddress({ foo: 'bar', cep: '  ' })).toBeNull();
  });
});

describe('linhas', () => {
  it('não deixa vírgula ou barra sobrando', () => {
    expect(streetLine({ street: 'Rua X', number: '' })).toBe('Rua X');
    expect(streetLine({ street: 'Rua X', number: '10' })).toBe('Rua X, 10');
    expect(cityLine({ city: 'Blumenau', state: '' })).toBe('Blumenau');
  });
});
