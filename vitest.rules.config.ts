import { defineConfig } from 'vitest/config';

// Config separada da principal (vitest.config.ts) de propósito: os testes
// aqui exigem o emulador do Firestore rodando (ver package.json,
// script "test:rules"), diferente da suíte normal (`npm test`), que é
// só funções puras e roda rápido sem nenhuma infra externa. Manter
// separado evita que `npm test` tente rodar isso sem emulador e trave.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['firestore.rules.test.ts'],
    testTimeout: 20000,
  },
});
