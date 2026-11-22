import { describe, expect, it } from 'vitest';
import { newDeviceEmail } from './newDeviceEmail';

const base = {
  email: 'maria@x.com',
  when: new Date('2026-12-01T15:30:00Z'),
  device: 'Android · Chrome',
  place: 'Blumenau, Santa Catarina, Brasil',
  ip: '200.1.2.3',
  via: 'password' as const,
  actionUrl: 'https://mikma.com.br/entrar?esqueci=1',
};

describe('e-mail de acesso por aparelho novo', () => {
  it('diz quando (horário de Brasília), aparelho, de onde e como, e o que fazer se não foi a dona', () => {
    const { subject, text, html } = newDeviceEmail(base);
    expect(subject).toBe('Novo acesso à sua conta da Mikma Lençóis');
    expect(text).toContain('01/12/2026, 12:30 (horário de Brasília)');
    expect(text).toContain('Aparelho: Android · Chrome');
    expect(text).toContain('De onde: Blumenau, Santa Catarina, Brasil (IP 200.1.2.3)');
    expect(text).toContain('Como: com e-mail e senha');
    expect(text).toContain('Foi você? Não precisa fazer nada.');
    expect(text).toContain('Crie uma senha nova agora');
    expect(html).toContain('href="https://mikma.com.br/entrar?esqueci=1"');
    expect(html).toContain('Criar senha nova');
  });

  it('sem local provado, mostra só o IP', () => {
    expect(newDeviceEmail({ ...base, place: null }).text).toContain('De onde: IP 200.1.2.3');
  });

  it('pelo Google, manda trocar a senha do Google e sair de todos os aparelhos', () => {
    const { text, html } = newDeviceEmail({ ...base, via: 'google', actionUrl: 'https://mikma.com.br/conta' });
    expect(text).toContain('Como: pelo Google');
    expect(text).toContain('Troque a senha do Google');
    expect(html).toContain('Abrir minha conta');
    expect(html).not.toContain('Criar senha nova');
  });

  it('o que vem do navegador não vira HTML', () => {
    const { html } = newDeviceEmail({ ...base, device: '<img src=x onerror=alert(1)>', place: 'São Paulo <b>', email: 'a"b@x.com' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('São Paulo &lt;b&gt;');
    expect(html).not.toContain('a"b@x.com');
  });
});
