import { describe, it, expect } from 'vitest';
import { userMessage } from './userMessage';

describe('userMessage', () => {
  it('mantém mensagem escrita pro cliente', () => {
    expect(userMessage(new Error('Muitas tentativas. Aguarde um minuto.'))).toBe('Muitas tentativas. Aguarde um minuto.');
    expect(userMessage(new Error('Este pedido não pode mais receber um novo PIX.'))).toBe('Este pedido não pode mais receber um novo PIX.');
  });
  it('rede vira erro de conexão', () => {
    expect(userMessage(new TypeError('Failed to fetch'))).toMatch(/Erro de conexão/);
    expect(userMessage(new Error('Load failed'))).toMatch(/Erro de conexão/);
  });
  it('texto técnico vira o genérico', () => {
    for (const m of ["Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON", 'Unauthorized', 'Payment provider not configured',
      'Firebase: Error (auth/popup-blocked).', 'Erro interno', 'Invalid token', 'Pedido não pode ter PIX gerado neste status pending_payment']) {
      expect(userMessage(new Error(m), 'X')).toBe('X');
    }
  });
});
