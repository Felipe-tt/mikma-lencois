import { test, expect } from '@playwright/test';
import { login, prepare } from './helpers';

test.beforeEach(async ({ context }) => { await prepare(context); });

test('cria passkey no perfil e entra com ela, sem senha', async ({ page, context }) => {
  test.setTimeout(120_000);
  // Autenticador virtual do Chromium: faz o papel do Face ID/digital.
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal',
      hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await login(page, 'cliente@e2e.mikma', 'senha-e2e-123');
  await page.goto('/perfil');
  await page.getByRole('button', { name: /^Criar (outra )?passkey$/ }).click();
  await expect(page.getByText('Passkey criada').first()).toBeVisible();
  // A passkey ficou no aparelho (o site guardou só a chave pública).
  const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  expect(credentials).toHaveLength(1);
  expect(credentials[0].isResidentCredential).toBe(true);
  // Sai e entra de novo só com a passkey
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/perfil'));
  await page.goto('/entrar');
  await page.getByRole('button', { name: 'Entrar com passkey' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/entrar'), { timeout: 30_000 });

  await page.goto('/perfil');
  await expect(page.getByText(/usada em/).first()).toBeVisible();
});

test('passkey desconhecida ou desafio inválido é recusado', async ({ request }) => {
  const res = await request.post('/api/auth/passkey/login', {
    data: { step: 'verify', challengeId: 'f'.repeat(32), response: { id: 'AAAAAAAAAAAAAAAAAAAAAA', response: {} } },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/expirou/);
});
