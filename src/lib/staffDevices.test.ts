import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn(async (..._args: unknown[]) => ({}));
const listUsers = vi.fn(async () => ({
  users: [
    { email: 'Dona@Mikma.com.br', customClaims: { role: 'admin' }, disabled: false },
    { email: 'saiu@mikma.com.br', customClaims: { role: 'admin' }, disabled: true },
    { email: 'vendedor@mikma.com.br', customClaims: { role: 'seller' }, disabled: false },
    { email: 'cliente@x.com', customClaims: { role: 'buyer' }, disabled: false },
  ],
}));
vi.mock('@/lib/email', () => ({ sendEmail }));
vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { listUsers }, adminDb: {} }));

const { notifyPasskeyAdded, notifyPiiScan } = await import('./staffDevices');

const base = { uid: 'u1', ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', place: 'Blumenau, SC, Brasil' };
const recipients = () => sendEmail.mock.calls.map(c => (c[0] as { to: string }).to).sort();

describe('aviso de passkey nova', () => {
  beforeEach(() => { sendEmail.mockClear(); listUsers.mockClear(); });

  it('conta da equipe só com senha: avisa a pessoa e os admins ativos', async () => {
    await notifyPasskeyAdded({ ...base, email: 'vendedor@mikma.com.br', role: 'seller', claims: { firebase: { sign_in_provider: 'password' } } });
    expect(recipients()).toEqual(['dona@mikma.com.br', 'vendedor@mikma.com.br']);
    const { html, text, subject } = sendEmail.mock.calls[0][0] as { html: string; text: string; subject: string };
    expect(subject).toBe('Nova passkey na conta da Mikma');
    expect(text).toContain('vendedor@mikma.com.br (vendedor)');
    expect(text).toContain('só com a senha');
    expect(text).toContain('Blumenau, SC, Brasil (IP 203.0.113.7)');
    expect(html).toContain('no Painel, em Segurança');
  });

  it('cliente: avisa só a própria pessoa', async () => {
    await notifyPasskeyAdded({ ...base, email: 'cliente@x.com', role: 'buyer', claims: { firebase: { sign_in_provider: 'password' } } });
    expect(recipients()).toEqual(['cliente@x.com']);
    expect(listUsers).not.toHaveBeenCalled();
    expect((sendEmail.mock.calls[0][0] as { text: string }).text).toContain('em Meus dados');
  });

  it('o e-mail não deixa passar HTML de quem cadastrou', async () => {
    await notifyPasskeyAdded({ ...base, email: 'cliente@x.com', role: 'buyer', claims: {}, place: '<img src=x onerror=alert(1)>' });
    expect((sendEmail.mock.calls[0][0] as { html: string }).html).not.toContain('<img src=x');
  });
});

describe('aviso de muitos CPFs abertos', () => {
  beforeEach(() => { sendEmail.mockClear(); listUsers.mockClear(); });

  it('avisa a própria pessoa e os admins ativos, com o teto e o IP', async () => {
    await notifyPiiScan({ uid: 'v1', email: 'vendedor@mikma.com.br', ip: '203.0.113.9', perHour: 120 });
    expect(recipients()).toEqual(['dona@mikma.com.br', 'vendedor@mikma.com.br']);
    const { text, subject } = sendEmail.mock.calls[0][0] as { text: string; subject: string };
    expect(subject).toContain('muitos CPFs');
    expect(text).toContain('mais de 120 clientes');
    expect(text).toContain('203.0.113.9');
  });
});
