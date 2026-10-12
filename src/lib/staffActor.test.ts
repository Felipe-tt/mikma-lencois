import { describe, it, expect } from 'vitest';
import { staffActor } from './staffActor';

describe('staffActor', () => {
  it('usa o nome de exibição', () => {
    expect(staffActor({ displayName: 'Maria Souza' })).toBe('Maria Souza');
  });
  it('cai em "Equipe" sem nome, usuário nulo ou nome só de lixo', () => {
    expect(staffActor(null)).toBe('Equipe');
    expect(staffActor({ displayName: null })).toBe('Equipe');
    expect(staffActor({ displayName: '  <>@ ' })).toBe('Equipe');
  });
  it('nunca devolve algo com @ (e-mail) e limita o tamanho', () => {
    expect(staffActor({ displayName: 'maria@loja.com' })).not.toContain('@');
    expect(staffActor({ displayName: 'A'.repeat(200) })).toHaveLength(40);
  });
});
