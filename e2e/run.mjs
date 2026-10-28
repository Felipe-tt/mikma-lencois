#!/usr/bin/env node
/**
 * Testes ponta a ponta: sobe a loja de verdade (build de produção) contra os
 * emuladores do Firebase e uma AbacatePay simulada, e roda o Playwright.
 *
 *   npm run e2e             (sobe os emuladores, compila e testa)
 *   E2E_SKIP_BUILD=1 ...    reaproveita o .next já compilado para os testes
 *
 * Nenhum segredo real: tudo aqui é gerado na hora ou é valor de teste.
 */
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { startAbacatePayMock } from './mocks/abacatepay-server.mjs';
import { seed } from './seed.mjs';

const PORT = process.env.E2E_PORT || '3200';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });

const env = {
  ...process.env,
  NODE_ENV: 'production',
  GCLOUD_PROJECT: 'demo-mikma',
  FIREBASE_PROJECT_ID: 'demo-mikma',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-mikma',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'e2e-fake-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
  NEXT_PUBLIC_FIREBASE_EMULATORS: '1',
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099',
  FIREBASE_CLIENT_EMAIL: 'e2e@demo-mikma.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: privateKey,
  ABACATEPAY_API_KEY: 'e2e_abacate_key',
  ABACATEPAY_WEBHOOK_SECRET: 'e2e_webhook_secret',
  CRON_SECRET: 'e2e_cron_secret_0123456789',
  STAFF_SESSION_SECRET: 'e2e_staff_session_secret_0123456789abcdef',
  EDGE_SHARED_SECRET: 'e2e-edge',
  NEXT_TELEMETRY_DISABLED: '1',
  E2E_BASE_URL: `http://localhost:${PORT}`,
  // Passkeys: o domínio aceito vem daqui (localhost nos testes).
  NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
};

function run(cmd, args, extra = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...env, ...extra } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (process.env.E2E_SKIP_BUILD !== '1') run('npx', ['next', 'build']);

// Porta ocupada = sobrou um servidor de outra rodada: testaria código velho.
if (await fetch(`http://localhost:${PORT}/`).then(() => true, () => false)) {
  console.error(`A porta ${PORT} já está em uso. Feche o servidor antigo e rode de novo.`);
  process.exit(1);
}

const mock = await startAbacatePayMock(4010);
await seed();

// Grupo de processos próprio: no fim, derruba o npx E o next-server filho.
const server = spawn('npx', ['next', 'start', '-p', PORT], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --import ./e2e/mocks/preload.mjs`.trim() },
});
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });

let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await new Promise(r => setTimeout(r, 1000));
  up = await fetch(`http://localhost:${PORT}/`, { headers: { 'x-mikma-edge': 'e2e-edge' } }).then(r => r.status === 200, () => false);
}
let code = 1;
if (!up) {
  console.error('A loja não subiu:\n' + serverLog.slice(-3000));
} else {
  // E2E_ARGS: argumentos extras para o Playwright (ex.: "compra" roda só esse arquivo).
  const extraArgs = (process.env.E2E_ARGS ?? '').split(' ').filter(Boolean);
  // Assíncrono: o simulador da AbacatePay roda neste processo e precisa responder.
  const pw = spawn('npx', ['playwright', 'test', '-c', 'e2e/playwright.config.ts', ...extraArgs], { stdio: 'inherit', env });
  code = await new Promise(resolve => pw.on('close', c => resolve(c ?? 1)));
  if (code !== 0) console.error('\n── log do servidor (fim) ──\n' + serverLog.slice(-4000));
}
// E2E_KEEP=1: mantém a loja e os simuladores no ar para investigar (Ctrl+C sai).
if (process.env.E2E_KEEP === '1') {
  console.log(`Loja de teste no ar em http://localhost:${PORT} (Ctrl+C para sair)`);
  await new Promise(() => {});
}
try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
mock.close();
process.exit(code);
