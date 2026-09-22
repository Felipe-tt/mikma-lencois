import { describe, it, expect } from 'vitest';
import { sanitizePixDescription } from './abacatepay';

describe('sanitizePixDescription', () => {
  it('remove o "·" que já derrubou o PIX em produção (400 Disallowed character)', () => {
    const desc = 'Pedido #ABC12345 · frete Correios SEDEX';
    expect(sanitizePixDescription(desc)).not.toContain('·');
  });

  it('remove acento em vez de deixar passar (ex: "Entrega própria")', () => {
    const desc = 'Pedido #ABC12345 - frete Entrega própria';
    const out = sanitizePixDescription(desc);
    expect(out).not.toMatch(/[^\x00-\x7F]/); // nada fora do ASCII básico
    expect(out).toContain('propria');
  });

  it('mantém uma descrição já limpa sem alterar o conteúdo', () => {
    const desc = 'Pedido #ABC12345 - frete Correios SEDEX';
    expect(sanitizePixDescription(desc)).toBe(desc);
  });

  it('mantém letras, números, #, hífen e barra', () => {
    expect(sanitizePixDescription('Pedido #123-ABC/teste')).toBe('Pedido #123-ABC/teste');
  });

  it('nunca deixa passar nenhum caractere fora de A-Za-z0-9, espaço, # - /', () => {
    const desc = 'Pedido #ABC · çãõáéíóú @ % & * ( ) ! ? ; : "quote" \'apo\' 日本語';
    const out = sanitizePixDescription(desc);
    expect(out).toMatch(/^[A-Za-z0-9 #\-/]*$/);
  });

  it('colapsa espaços múltiplos gerados pela sanitização', () => {
    const out = sanitizePixDescription('Pedido #ABC · · · frete');
    expect(out).not.toMatch(/ {2,}/);
  });

  it('não deixa espaço sobrando nas pontas', () => {
    expect(sanitizePixDescription('  Pedido #ABC  ')).toBe('Pedido #ABC');
  });
});
