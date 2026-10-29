import { defineConfig, devices } from '@playwright/test';

/** Testes ponta a ponta. Rodar com `npm run e2e` (sobe emuladores e a loja). */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3200',
    // A loja só aceita tráfego vindo da Cloudflare (cabeçalho de borda).
    extraHTTPHeaders: { 'x-mikma-edge': 'e2e-edge' },
    // A CSP vale nos testes (com os emuladores liberados, ver src/proxy.ts):
    // um script barrado pela CSP ou pelos Trusted Types quebra o teste aqui.
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
