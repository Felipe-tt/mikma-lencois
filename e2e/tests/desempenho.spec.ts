import { test, expect, type Page } from '@playwright/test';
import { prepare } from './helpers';

/**
 * Orçamento de desempenho no celular: cada página da vitrine abre num
 * aparelho mais lento (CPU 4x mais lenta, rede 4G fraca) e não pode passar
 * dos limites abaixo. Uma mudança que deixe o site pesado ou lento quebra o
 * CI aqui, antes de chegar ao cliente.
 *
 * Os limites têm folga sobre o medido (o runner do GitHub varia de uma
 * rodada para outra): o objetivo é pegar piora grande, não oscilação.
 */
const BUDGET = {
  /** Maior elemento visível desenhado (LCP), em ms. Medido: ~2 s. */
  lcpMs: 4500,
  /** Pulos de layout (CLS). Medido: 0. */
  cls: 0.1,
};
/** JavaScript que o HTML da página pede para abrir (comprimido), em KB, por página. */
const JS_KB = {
  vitrine: 260, // medido: 176 (home) e 188 (/produtos)
  produto: 290, // medido: 202
};

test.beforeEach(async ({ context }) => { await prepare(context); });

async function measure(page: Page, path: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  // "4G lento" do Lighthouse: 150 ms de latência, 1,6 Mbps de download.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __cls: number };
    w.__lcp = 0; w.__cls = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) w.__lcp = e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!e.hadRecentInput) w.__cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  await page.goto(path, { waitUntil: 'load' });
  // LCP só fecha com interação ou ao esconder a página; espera a rede assentar.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // JS que o HTML da página pede para abrir (as tags <script src> e os
  // preloads de script). É fixo para um mesmo build: o que o Next carrega
  // depois, sob demanda ou pré-carregando links, varia com o tempo de rede
  // e não entra (antes a conta mudava de 202 para 459 KB entre rodadas).
  const html = await (await page.request.get(path)).text();
  const critical = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"|<link[^>]+rel="preload"[^>]+as="script"[^>]+href="([^"]+)"|<link[^>]+href="([^"]+\.js)"[^>]+rel="preload"/g)]
    .map(m => m[1] ?? m[2] ?? m[3]);

  return page.evaluate((criticalPaths) => {
    const w = window as unknown as { __lcp: number; __cls: number };
    const wanted = new Set(criticalPaths.map(p => new URL(p, location.href).pathname));
    const js = performance.getEntriesByType('resource')
      .filter(r => new URL(r.name).origin === location.origin && wanted.has(new URL(r.name).pathname))
      .reduce((s, r) => s + (r as PerformanceResourceTiming).encodedBodySize, 0);
    return { lcpMs: Math.round(w.__lcp), cls: Number(w.__cls.toFixed(3)), jsKb: Math.round(js / 1024), scripts: wanted.size };
  }, critical);
}

function check(label: string, m: { lcpMs: number; cls: number; jsKb: number; scripts: number }, jsKb: number) {
  expect(m.scripts, `${label}: achou os scripts do HTML`).toBeGreaterThan(0);
  console.log(`desempenho ${label}: ${JSON.stringify(m)}`);
  expect(m.jsKb, `${label}: JavaScript em KB`).toBeLessThanOrEqual(jsKb);
  expect(m.lcpMs, `${label}: LCP em ms`).toBeLessThanOrEqual(BUDGET.lcpMs);
  expect(m.cls, `${label}: CLS`).toBeLessThanOrEqual(BUDGET.cls);
}

for (const path of ['/', '/produtos']) {
  test(`orçamento de desempenho no celular: ${path}`, async ({ page }) => {
    check(path, await measure(page, path), JS_KB.vitrine);
  });
}

test('orçamento de desempenho no celular: página de produto', async ({ page }) => {
  await page.goto('/produtos');
  const href = await page.locator('a[href^="/produtos/p"]').first().getAttribute('href');
  expect(href).toBeTruthy();
  check(href!, await measure(page, href!), JS_KB.produto);
});
