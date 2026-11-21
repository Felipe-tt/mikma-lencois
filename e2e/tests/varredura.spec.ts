import { test, expect, type Page } from '@playwright/test';
import { login, prepare, staffLogin } from './helpers';
import { forgetPasskeys } from './db';

/**
 * Abre as telas da conta do cliente e todas as do painel (seguindo os links
 * do próprio painel) atrás de erro de JavaScript, de CSP, resposta 4xx/5xx
 * do site, tela de erro e link de contato sem o 55.
 */
async function visit(page: Page, baseURL: string, start: string[], follow: (path: string) => boolean, max: number) {
  const problems: string[] = [];
  let current = '';
  page.on('console', m => { if (m.type() === 'error') problems.push(`${current} [console] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => problems.push(`${current} [js] ${String(e).slice(0, 200)}`));
  page.on('response', r => {
    if (r.status() >= 400 && r.url().startsWith(baseURL) && !r.url().includes('/api/app-check')) problems.push(`${current} [http ${r.status()}] ${r.url().replace(baseURL, '')}`);
  });
  const seen = new Set<string>();
  const queue = [...start];
  while (queue.length && seen.size < max) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    current = path;
    const res = await page.goto(path, { waitUntil: 'load' });
    if (res && res.status() >= 400) problems.push(`${path} [página ${res.status()}]`);
    // Com login, o Firestore mantém a conexão aberta: não há "rede parada".
    await page.waitForTimeout(2000);
    if (/Application error|Internal Server Error|Algo deu errado/i.test(await page.locator('body').innerText())) problems.push(`${path} [tela de erro]`);
    for (const href of await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href') ?? ''))) {
      if (/^https:\/\/wa\.me\/(?!55|\?)/.test(href)) problems.push(`${path} [WhatsApp sem 55] ${href}`);
      const clean = href.split(/[?#]/)[0];
      if (clean.startsWith('/') && follow(clean) && !seen.has(clean) && !queue.includes(clean)) queue.push(clean);
    }
  }
  return { seen, problems };
}

test.beforeEach(async ({ context }) => { await prepare(context); });

test('conta do cliente sem erro', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  await login(page, 'cliente@e2e.mikma', 'senha-e2e-123');
  const { problems } = await visit(page, baseURL!, ['/conta', '/conta/pedidos', '/perfil', '/favoritos', '/carrinho', '/checkout'], () => false, 10);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('todas as telas do painel sem erro', async ({ page, baseURL }) => {
  test.setTimeout(300_000);
  // As contas da equipe são revezadas pelos outros testes: a passkey que um
  // deles criou não está neste navegador (o login cria outra).
  await forgetPasskeys('equipe6@e2e.mikma');
  await staffLogin(page, 'equipe6@e2e.mikma', 'senha-e2e-123');
  const start = ['/painel', '/painel/pedidos', '/painel/produtos', '/painel/estoque', '/painel/cupons', '/painel/mensagens', '/painel/relatorios', '/painel/trocas', '/painel/avaliacoes', '/painel/configuracoes', '/painel/manutencao', '/painel/seguranca'];
  const { seen, problems } = await visit(page, baseURL!, start, p => p.startsWith('/painel'), 40);
  expect(seen.size).toBeGreaterThanOrEqual(start.length);
  expect(problems, problems.join('\n')).toEqual([]);
});
