#!/usr/bin/env node
/**
 * Testa o site no ar como um cliente faria e responde:
 *   ok           tudo respondeu certo
 *   fail         algo quebrou de verdade (5xx, timeout, página de erro, asset sumido)
 *   inconclusive bloqueio da Cloudflare (403/429) ou só o banco fora: não é
 *                culpa do deploy, então nunca dispara rollback
 * Uso: node scripts/site-health.mjs [rodadas] [intervalo_s]
 * Sai com 0 (ok), 1 (fail em TODAS as rodadas) ou 2 (inconclusivo).
 * Lê SITE_URL (padrão https://mikma.com.br), CRON_SECRET e, só em teste
 * local, HEALTH_EXTRA_HEADER do ambiente.
 */
const BASE = process.env.SITE_URL || 'https://mikma.com.br';
const SECRET = process.env.CRON_SECRET || '';
const rounds = Number(process.argv[2] || 3);
const gapMs = Number(process.argv[3] || 45) * 1000;
const UA = 'MikmaHealthCheck/1.0 (+github-actions)';
// Só para teste local ("nome: valor"), ex.: o cabeçalho que a Cloudflare injeta.
const EXTRA = process.env.HEALTH_EXTRA_HEADER?.match(/^([^:]+):\s*(.*)$/);
const extra = EXTRA ? { [EXTRA[1].trim()]: EXTRA[2] } : {};

async function get(path, headers = {}) {
  const started = Date.now();
  try {
    const res = await fetch(BASE + path, { headers: { 'user-agent': UA, ...extra, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    const body = await res.text();
    return { status: res.status, body, ms: Date.now() - started, cache: res.headers.get('cf-cache-status') ?? '' };
  } catch (err) {
    return { status: 0, body: String(err?.message ?? err), ms: Date.now() - started, cache: '' };
  }
}

const blocked = s => s === 403 || s === 429;

async function round() {
  const checks = [];
  const add = (name, verdict, detail) => checks.push({ name, verdict, detail });

  const home = await get('/');
  if (blocked(home.status)) add('home', 'inconclusive', `HTTP ${home.status}`);
  else if (home.status !== 200) add('home', 'fail', `HTTP ${home.status} ${home.body.slice(0, 120)}`);
  else if (!/Mikma/i.test(home.body) || /Application error|Internal Server Error/i.test(home.body)) add('home', 'fail', 'página sem o conteúdo esperado');
  else add('home', 'ok', `${home.ms}ms`);

  // Asset JS da home: deploy com chunk faltando quebra o site inteiro no navegador.
  const chunk = home.status === 200 ? home.body.match(/\/_next\/static\/chunks\/[\w.-]+\.js/)?.[0] : null;
  if (chunk) {
    const js = await get(chunk);
    add('asset', blocked(js.status) ? 'inconclusive' : js.status === 200 ? 'ok' : 'fail', `${chunk} HTTP ${js.status}`);
  }

  for (const path of ['/produtos', '/api/products']) {
    const r = await get(path);
    const okJson = path.startsWith('/api') ? (() => { try { JSON.parse(r.body); return true; } catch { return false; } })() : true;
    add(path, blocked(r.status) ? 'inconclusive' : r.status === 200 && okJson ? 'ok' : 'fail', `HTTP ${r.status} ${r.ms}ms`);
  }

  // Cache do HTML na Cloudflare: a segunda visita à home deve vir da borda.
  // Só aviso (nunca derruba o veredito): cache frio não é site quebrado.
  if (home.status === 200 && BASE.startsWith('https://')) {
    const again = await get('/');
    const hit = /^(HIT|STALE|UPDATING|REVALIDATED)$/.test(again.cache);
    add('cache', hit ? 'ok' : 'aviso', `cf-cache-status ${again.cache || '(ausente)'} ${again.ms}ms`);
  }

  if (SECRET) {
    const h = await get('/api/cron/health', { 'x-cron-secret': SECRET });
    let data = {};
    try { data = JSON.parse(h.body); } catch { /* corpo não-JSON */ }
    // 401/404: segredo ou rota fora de sincronia (configuração), não site quebrado.
    if (blocked(h.status) || h.status === 401 || h.status === 404) add('health', 'inconclusive', `HTTP ${h.status}`);
    else if (h.status === 503 && data.firestore === false && Object.values(data.env ?? {}).every(Boolean)) {
      // Só o banco fora: problema do Google, não do deploy.
      add('health', 'inconclusive', 'Firestore indisponível');
    } else add('health', h.status === 200 && data.ok ? 'ok' : 'fail', `HTTP ${h.status} ${h.body.slice(0, 200)}`);
  }

  const verdict = checks.some(c => c.verdict === 'fail') ? 'fail' : checks.some(c => c.verdict === 'inconclusive') ? 'inconclusive' : 'ok';
  return { verdict, checks };
}

const results = [];
for (let i = 0; i < rounds; i++) {
  const r = await round();
  results.push(r);
  console.log(`rodada ${i + 1}: ${r.verdict}`);
  for (const c of r.checks) console.log(`  ${c.verdict.padEnd(12)} ${c.name}: ${c.detail}`);
  if (r.verdict !== 'fail') break; // só insiste quando está falhando
  if (i < rounds - 1) await new Promise(res => setTimeout(res, gapMs));
}
const final = results.every(r => r.verdict === 'fail') && results.length === rounds ? 'fail'
  : results.at(-1).verdict === 'ok' ? 'ok' : results.at(-1).verdict === 'fail' ? 'inconclusive' : results.at(-1).verdict;
console.log(`resultado: ${final}`);
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${final}\n`);
}
process.exit(final === 'ok' ? 0 : final === 'fail' ? 1 : 2);
