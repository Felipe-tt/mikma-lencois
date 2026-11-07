import { describe, it, expect } from 'vitest';
import { pauseNotice } from './salesPause';

describe('pauseNotice', () => {
  it('loja vendendo: sem aviso', () => {
    expect(pauseNotice({ salesPaused: false, salesPausedMessage: 'x' })).toBeNull();
    expect(pauseNotice({})).toBeNull();
  });
  it('pausada sem texto: aviso padrão, com a volta quando houver data', () => {
    expect(pauseNotice({ salesPaused: true })).toBe('No momento não estamos atendendo. Seu carrinho fica salvo para quando voltarmos.');
    expect(pauseNotice({ salesPaused: true, salesPausedUntil: '2027-01-15' })).toBe('No momento não estamos atendendo, voltamos em 15/01. Seu carrinho fica salvo para quando voltarmos.');
  });
  it('pausada com texto próprio: usa o texto da loja', () => {
    expect(pauseNotice({ salesPaused: true, salesPausedMessage: '  Férias coletivas!  ' })).toBe('Férias coletivas!');
  });
});
