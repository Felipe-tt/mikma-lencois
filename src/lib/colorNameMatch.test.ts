import { describe, it, expect } from 'vitest';
import { formatColorName, colorKey, matchColorName } from './colorNameMatch';

describe('formatColorName', () => {
  it('padroniza maiúsculas e espaços', () => {
    expect(formatColorName('  azul   MARINHO ')).toBe('Azul Marinho');
    expect(formatColorName('rosa de chá')).toBe('Rosa de Chá');
    expect(formatColorName('off-white')).toBe('Off-White');
  });
});

describe('matchColorName', () => {
  const loja = ['Azul Marinho', 'Off-White', 'Verde Sálvia', 'Rosa'];
  it('mesma cor escrita de outro jeito', () => {
    expect(matchColorName('azul marinho', loja)).toEqual({ kind: 'same', name: 'Azul Marinho' });
    expect(matchColorName('AZUL  MARINHO', loja)).toEqual({ kind: 'same', name: 'Azul Marinho' });
    expect(matchColorName('Azul marinhoo', loja)).toEqual({ kind: 'same', name: 'Azul Marinho' });
    expect(matchColorName('verde salvia', loja)).toEqual({ kind: 'same', name: 'Verde Sálvia' });
    expect(matchColorName('off white', loja)).toEqual({ kind: 'same', name: 'Off-White' });
  });
  it('erro de digitação vira pergunta', () => {
    expect(matchColorName('Azul marino', loja)).toEqual({ kind: 'typo', name: 'Azul Marinho' });
    expect(matchColorName('Verde Salva', loja)).toEqual({ kind: 'typo', name: 'Verde Sálvia' });
    expect(matchColorName('Brnaco', ['Branco'])).toEqual({ kind: 'typo', name: 'Branco' });
  });
  it('cor diferente não vira sugestão', () => {
    expect(matchColorName('Azul', loja)).toEqual({ kind: 'none' });
    expect(matchColorName('Preto', loja)).toEqual({ kind: 'none' });
    expect(matchColorName('Rosa Chá', loja)).toEqual({ kind: 'none' });
  });
  it('chave ignora acento e letra repetida', () => {
    expect(colorKey('Bordô')).toBe(colorKey('bordo'));
  });
});
