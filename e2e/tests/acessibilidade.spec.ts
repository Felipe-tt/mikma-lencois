import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { prepare } from './helpers';

/**
 * Acessibilidade (axe, WCAG 2.1 A/AA e boas práticas) e erros nas páginas
 * principais da loja: nenhum erro de JavaScript, de CSP (aparece no console)
 * nem resposta 4xx/5xx do próprio site.
 */
const AXE = readFileSync(`${process.cwd()}/node_modules/axe-core/axe.min.js`, 'utf8');
const PAGES = ['/', '/produtos', '/produtos/p1', '/produtos/p3', '/carrinho', '/checkout', '/sobre', '/privacidade', '/termos', '/trocas-e-devolucoes', '/guia-de-tamanhos', '/entrar', '/cadastro', '/politica-de-cookies',
  // Página do link do e-mail de confirmação de login (pergunta "Foi você?").
  `/confirmar-login?email=alguem%40e2e.mikma&token=${'t'.repeat(43)}`];

test.beforeEach(async ({ context }) => { await prepare(context); });

test('páginas da loja acessíveis e sem erro', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  let current = '';
  page.on('console', m => { if (m.type() === 'error') problems.push(`${current} [console] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => problems.push(`${current} [js] ${String(e).slice(0, 200)}`));
  page.on('response', r => {
    if (r.status() >= 400 && r.url().startsWith(baseURL!) && !r.url().includes('/api/app-check')) problems.push(`${current} [http ${r.status()}] ${r.url().replace(baseURL!, '')}`);
  });
  for (const path of PAGES) {
    current = path;
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.evaluate(AXE);
    const violations = await page.evaluate(async () => {
      // @ts-expect-error axe vem do script acima
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } });
      return r.violations.map((v: { id: string; impact: string; help: string; nodes: { target: string[] }[] }) =>
        `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')})`);
    });
    for (const v of violations) problems.push(`${path} ${v}`);
  }
  expect(problems, problems.join('\n')).toEqual([]);
});
