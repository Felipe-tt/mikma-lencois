import { test, expect } from '@playwright/test';
import { prepare, staffLogin } from './helpers';
import { db, forgetPasskeys } from './db';

/**
 * E-mail de cliente no painel. O HTML vem de qualquer pessoa: além da
 * limpeza na chegada, aparece num quadro sem scripts. O teste grava direto
 * no banco um HTML que a limpeza não deixaria passar (como se ela falhasse):
 * nada dele pode rodar na página da equipe.
 */
const CONVERSA = 'e2e-html-perigoso';

test.beforeEach(async ({ context }) => { await prepare(context); });
test.afterEach(async () => { await db().recursiveDelete(db().collection('conversations').doc(CONVERSA)); });

test('e-mail recebido aparece sem rodar script no painel', async ({ page }) => {
  const now = new Date().toISOString();
  const conversa = db().collection('conversations').doc(CONVERSA);
  await conversa.set({ customerEmail: 'golpe@e2e.mikma', customerName: 'Golpe', lastMessagePreview: 'Segue o comprovante', lastMessageAt: now, unread: true, messageCount: 1, createdAt: now });
  // Conversa longa: o e-mail em HTML por último, que só ganha altura depois de carregar.
  await Promise.all(Array.from({ length: 8 }, (_, i) => conversa.collection('messages').doc(`t${i}`).set({
    direction: i % 2 ? 'outbound' : 'inbound', from: 'golpe@e2e.mikma', text: `Mensagem ${i + 1} da conversa`,
    attachments: [], createdAt: new Date(Date.now() - 60_000 + i * 1000).toISOString(),
  })));
  await conversa.collection('messages').doc('m1').set({
    direction: 'inbound', from: 'golpe@e2e.mikma', to: 'contato@mikma.com.br', subject: 'Comprovante', text: 'Segue o comprovante',
    html: '<p>Segue o comprovante</p><img src="x" onerror="window.parent.__invadiu=1"><script>window.parent.__invadiu=2</script>'
      + '<a id="link" href="/sobre">ver loja</a>',
    attachments: [{ filename: 'fatura‮fdp.exe', contentType: 'application/octet-stream', path: 'email-attachments/m1/1_fatura.exe', isImage: false }],
    createdAt: now,
  });

  await forgetPasskeys('atende@e2e.mikma');
  await staffLogin(page, 'atende@e2e.mikma', 'senha-e2e-123');
  await page.goto(`/painel/mensagens?c=${CONVERSA}`);

  const quadro = page.locator('iframe[title="Conteúdo do e-mail"]');
  const dentro = page.frameLocator('iframe[title="Conteúdo do e-mail"]');
  await expect(dentro.getByText('Segue o comprovante')).toBeVisible();
  expect((await quadro.getAttribute('sandbox'))?.split(' ')).not.toContain('allow-scripts');
  // A altura acompanha o texto (o quadro não fica cortado nem com 150px fixos).
  await expect.poll(async () => (await quadro.boundingBox())?.height ?? 0).toBeGreaterThan(40);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __invadiu?: number }).__invadiu)).toBeUndefined();

  // Abre no fim da conversa, mesmo com o quadro crescendo depois de carregar.
  const conversaRolando = page.locator('div.overflow-y-auto.flex-col').last();
  await expect.poll(() => conversaRolando.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2);

  // Nome do anexo sem o caractere que inverte o texto e esconde o .exe.
  await expect(page.getByText('faturafdp.exe')).toBeVisible();

  // Tema do painel vale lá dentro.
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expect(dentro.locator('html')).toHaveClass(/dark/);

  // Link abre em outra aba, fora do quadro; o painel continua onde estava.
  const [aba] = await Promise.all([page.waitForEvent('popup'), dentro.locator('#link').click()]);
  await aba.waitForLoadState('domcontentloaded');
  expect(new URL(aba.url()).pathname).toBe('/sobre');
  expect(new URL(page.url()).pathname).toBe('/painel/mensagens');
});
