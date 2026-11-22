import { describe, expect, it } from 'vitest';
import { loginChallengeEmail } from './loginChallengeEmail';

const base = {
  confirmUrl: 'https://mikma.com.br/confirmar-login?email=maria%40x.com&token=abc',
  denyUrl: 'https://mikma.com.br/confirmar-login?email=maria%40x.com&token=abc&acao=negar',
  when: new Date('2026-11-22T03:15:00Z'),
  device: 'Windows · Chrome',
  place: 'Blumenau, SC, Brasil',
  ip: '203.0.113.9',
  reason: 'suspicious' as const,
};

describe('e-mail de confirmação de login', () => {
  it('diz quando, de onde e de qual aparelho, com os dois caminhos', () => {
    const { subject, html, text } = loginChallengeEmail(base);
    expect(subject).toBe('Foi você? Confirme o login na Mikma Lençóis');
    for (const out of [html, text]) {
      expect(out).toContain('22/11/2026, 00:15 (horário de Brasília)');
      expect(out).toContain('Windows · Chrome');
      expect(out).toContain('Blumenau, SC, Brasil (IP 203.0.113.9)');
      expect(out).toContain('Quem tentou entrar sabe a sua senha');
    }
    expect(html).toContain('Sim, fui eu');
    expect(html).toContain('Não fui eu');
    expect(html).toContain('token=abc&amp;acao=negar');
    expect(text).toContain(base.denyUrl);
    // Ignorar não basta: a senha já está com outra pessoa.
    expect(html).not.toContain('ninguém entra');
  });

  it('lugar novo: diz que veio de onde a conta nunca entrou, num aparelho novo', () => {
    const { text } = loginChallengeEmail({ ...base, reason: 'newplace', place: 'Moscou, Rússia' });
    expect(text).toContain('veio de um lugar de onde a sua conta nunca entrou, num aparelho que ela ainda não usou');
    expect(text).toContain('Moscou, Rússia (IP 203.0.113.9)');
    expect(text).toContain('Quem tentou entrar sabe a sua senha');
  });

  it('senha em vazamento: diz o motivo e pede para trocar mesmo se foi a pessoa', () => {
    const { html, text } = loginChallengeEmail({ ...base, reason: 'leaked' });
    for (const out of [html, text]) {
      expect(out).toContain('já apareceu em vazamentos de dados');
      expect(out).toContain('troque a senha por uma que você não use em nenhum outro site');
    }
    expect(loginChallengeEmail(base).text).not.toContain('vazamentos');
  });

  it('senha trocada fora do site: diz isso e que quem trocou está tentando entrar', () => {
    const { html, text } = loginChallengeEmail({ ...base, reason: 'changed' });
    for (const out of [html, text]) {
      expect(out).toContain('A senha da conta foi trocada fora do site da Mikma');
      expect(out).toContain('Quem trocou a senha está tentando entrar na sua conta.');
      expect(out).not.toContain('vazamentos');
    }
  });

  it('sem local conhecido, mostra só o IP; e o aparelho não injeta HTML', () => {
    const { html } = loginChallengeEmail({ ...base, place: null, device: '<img src=x>' });
    expect(html).toContain('IP 203.0.113.9');
    expect(html).not.toContain('<img src=x>');
  });
});
