#!/usr/bin/env node
/**
 * Merchant Center pela API (Merchant API v1), para acompanhar os produtos
 * sem abrir o painel: registra o projeto do Google Cloud na conta (uma vez,
 * pedido pela API), lista os avisos da conta e o status de cada produto, e
 * escreve um resumo. Só lê, fora o registro.
 *
 * Uso (no GitHub Actions, com token de escopo "content"):
 *   MERCHANT_ID=5900898574 MERCHANT_TOKEN=... node scripts/merchant-center.mjs
 */
import { appendFileSync } from 'node:fs';

const ID = process.env.MERCHANT_ID;
const TOKEN = process.env.MERCHANT_TOKEN;
if (!ID || !TOKEN) { console.error('Faltam MERCHANT_ID e MERCHANT_TOKEN.'); process.exit(2); }
const API = 'https://merchantapi.googleapis.com';
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
const out = [];
const say = (line = '') => { console.log(line); out.push(line); };

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, json };
}

// 1. Registro do projeto na conta (exigido pela Merchant API). Repetir não faz mal.
const reg = await call('POST', `/accounts/v1/accounts/${ID}/developerRegistration:registerGcp`, {});
if (reg.ok) say('Projeto registrado na conta do Merchant Center.');
else if (/already/i.test(JSON.stringify(reg.json))) say('Projeto já registrado na conta.');
else say(`Registro do projeto: HTTP ${reg.status} ${JSON.stringify(reg.json.error?.message ?? reg.json).slice(0, 300)}`);

// 2. Avisos da conta (ex.: site não verificado, política de frete).
const issues = await call('GET', `/accounts/v1/accounts/${ID}/issues?pageSize=100&languageCode=pt-BR`);
say('');
say('## Avisos da conta');
if (!issues.ok) say(`Não deu para ler (HTTP ${issues.status}): ${issues.json.error?.message ?? ''}`);
else if (!issues.json.accountIssues?.length) say('Nenhum aviso.');
else for (const i of issues.json.accountIssues) say(`- [${i.severity ?? '?'}] ${i.title}${i.detail ? `: ${i.detail}` : ''}`);

// 3. Produtos, com status por destino e problemas.
const products = [];
let pageToken = '';
let failed = null;
do {
  const r = await call('GET', `/products/v1/accounts/${ID}/products?pageSize=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
  if (!r.ok) { failed = r; break; }
  products.push(...(r.json.products ?? []));
  pageToken = r.json.nextPageToken ?? '';
} while (pageToken);

say('');
say('## Produtos');
if (failed) {
  say(`Não deu para ler (HTTP ${failed.status}): ${failed.json.error?.message ?? ''}`);
} else {
  const count = { aprovado: 0, pendente: 0, reprovado: 0 };
  const byIssue = new Map();
  for (const p of products) {
    const dest = p.productStatus?.destinationStatuses ?? [];
    const state = dest.some(d => d.disapprovedCountries?.length) ? 'reprovado'
      : dest.some(d => d.approvedCountries?.length) ? 'aprovado' : 'pendente';
    count[state]++;
    for (const i of p.productStatus?.itemLevelIssues ?? []) {
      const key = `[${i.severity ?? '?'}] ${i.description ?? i.code}${i.attribute ? ` (campo ${i.attribute})` : ''}`;
      const e = byIssue.get(key) ?? { n: 0, detail: i.detail ?? '', ex: [] };
      e.n++;
      if (e.ex.length < 3) e.ex.push(p.productAttributes?.title ?? p.offerId);
      byIssue.set(key, e);
    }
  }
  say(`${products.length} produtos: ${count.aprovado} aprovados, ${count.pendente} em análise, ${count.reprovado} reprovados.`);
  say('');
  say('## Problemas nos produtos');
  if (!byIssue.size) say('Nenhum.');
  for (const [k, e] of [...byIssue].sort((a, b) => b[1].n - a[1].n)) {
    say(`- ${k}: ${e.n} produto(s)${e.detail ? `. ${e.detail}` : ''}`);
    say(`  ex.: ${e.ex.join('; ')}`);
  }
}

if (summaryFile) appendFileSync(summaryFile, `${out.join('\n')}\n`);
