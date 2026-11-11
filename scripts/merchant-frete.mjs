#!/usr/bin/env node
/**
 * Frete da loja no Merchant Center (Merchant API v1): três regiões por
 * estado e preço por peso, tirado do PAC do contrato até as capitais e
 * arredondado para cima. Sem argumento só mostra o que está lá; com
 * APLICAR=1 grava (substitui os serviços de frete da conta).
 *
 *   MERCHANT_ID=5900898574 MERCHANT_TOKEN=... [APLICAR=1] node scripts/merchant-frete.mjs
 */
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ID = process.env.MERCHANT_ID;
const TOKEN = process.env.MERCHANT_TOKEN;
const APLICAR = process.env.APLICAR === '1';
if (!ID || !TOKEN) { console.error('Faltam MERCHANT_ID e MERCHANT_TOKEN.'); process.exit(2); }
const API = `https://merchantapi.googleapis.com/accounts/v1/accounts/${ID}`;
const out = [];
const say = (line = '') => { console.log(line); out.push(line); };
const finish = code => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
  process.exit(code);
};

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
const erro = r => `HTTP ${r.status} ${String(r.json.error?.message ?? JSON.stringify(r.json)).slice(0, 400)}`;

// Regiões por estado. A tabela de frete só aceita o código de local do
// Google (Criteria ID), então os estados vêm da lista oficial de locais.
const REGIOES = [
  { id: 'sul', nome: 'Sul', estados: ['parana', 'santa catarina', 'rio grande do sul'] },
  { id: 'sudeste', nome: 'SP, RJ, MG e ES', estados: ['sao paulo', 'rio de janeiro', 'minas gerais', 'espirito santo'] },
  { id: 'demais', nome: 'Demais estados', estados: null }, // todos os outros
];
// Reais por faixa de peso: até 2 kg, de 2 a 5 kg, acima de 5 kg.
const PRECOS = { sul: [21, 29, 36], sudeste: [27, 41, 50], demais: [37, 56, 70] };

/** Estados do Brasil na lista de locais do Google: [{ id, nome }]. */
async function estadosDoGoogle() {
  const page = await (await fetch('https://developers.google.com/google-ads/api/data/geotargets')).text();
  const link = page.match(/\/static\/google-ads\/api\/data\/geo\/geotargets-[0-9-]+\.csv(?:\.zip)?/g)?.sort().pop();
  if (!link) throw new Error('link da lista de locais não encontrado');
  const buf = Buffer.from(await (await fetch(`https://developers.google.com${link}`)).arrayBuffer());
  const csv = link.endsWith('.zip') ? execFileSync('funzip', { input: buf, maxBuffer: 1 << 28 }).toString() : buf.toString();
  const out = [];
  for (const line of csv.split('\n')) {
    const cols = line.match(/("([^"]*)"|[^,]*)(,|$)/g)?.map(c => c.replace(/,$/, '').replace(/^"|"$/g, '')) ?? [];
    // Criteria ID, Name, Canonical Name, Parent ID, Country Code, Target Type, Status
    if (cols[4] === 'BR' && /^(State|Federal District)$/.test(cols[5] ?? '')) out.push({ id: cols[0], nome: cols[1] });
  }
  return out;
}
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^state of /, '').trim();
const micros = n => String(Math.round(n * 1_000_000));

// 1. Como está hoje.
const atual = await call('GET', '/shippingSettings');
say('## Frete no Merchant Center');
if (atual.ok) {
  const servicos = atual.json.services ?? [];
  say(servicos.length ? `Hoje: ${servicos.map(s => `${s.serviceName || 'sem nome'} (${s.active ? 'ativo' : 'inativo'})`).join(', ')}.` : 'Hoje: nenhum serviço de frete.');
} else if (atual.status === 404) say('Hoje: nenhum frete configurado.');
else { say(`Não deu para ler o frete: ${erro(atual)}`); finish(1); }

say('');
say('| Região | até 2 kg | 2 a 5 kg | mais de 5 kg |');
say('|---|---|---|---|');
for (const r of REGIOES) say(`| ${r.nome} | ${PRECOS[r.id].map(v => `R$ ${v}`).join(' | ')} |`);
if (!APLICAR) { say(''); say('Só leitura. Para gravar, rode o workflow com frete = gravar.'); finish(0); }

// 2. Estados de cada região.
let estados;
try { estados = await estadosDoGoogle(); } catch (err) { say(`Lista de estados do Google: ${err.message}`); finish(1); }
const usados = new Set();
for (const r of REGIOES.filter(r => r.estados)) {
  r.ids = estados.filter(e => r.estados.includes(norm(e.nome))).map(e => e.id);
  r.ids.forEach(id => usados.add(id));
  if (r.ids.length !== r.estados.length) { say(`Região ${r.nome}: achei ${r.ids.length} de ${r.estados.length} estados.`); finish(1); }
}
const demais = REGIOES.find(r => !r.estados);
demais.ids = estados.filter(e => !usados.has(e.id)).map(e => e.id);
if (demais.ids.length !== 20) { say(`Demais estados: achei ${demais.ids.length} de 20.`); finish(1); }
for (const r of REGIOES) say(`${r.nome}: ${r.ids.length} estados.`);

// Regiões avulsas de tentativas anteriores, sem uso.
for (const id of ['8001', '8002', '8003']) await call('DELETE', `/regions/${id}`);

// 3. Serviço de frete com a tabela região x peso.
const service = {
  serviceName: 'Correios PAC',
  active: true,
  deliveryCountries: ['BR'],
  currencyCode: 'BRL',
  shipmentType: 'DELIVERY',
  deliveryTime: { minHandlingDays: 0, maxHandlingDays: 2, minTransitDays: 2, maxTransitDays: 12 },
  rateGroups: [{
    name: 'Por região e peso',
    mainTable: {
      rowHeaders: { locations: REGIOES.map(r => ({ locationIds: r.ids })) },
      // -1 é "acima disso, sem limite".
      columnHeaders: { weights: [{ amountMicros: micros(2), unit: 'KILOGRAM' }, { amountMicros: micros(5), unit: 'KILOGRAM' }, { amountMicros: '-1', unit: 'KILOGRAM' }] },
      rows: REGIOES.map(r => ({ cells: PRECOS[r.id].map(v => ({ flatRate: { amountMicros: micros(v), currencyCode: 'BRL' } })) })),
    },
  }],
};
const body = { services: [service], ...(atual.ok ? { warehouses: atual.json.warehouses, etag: atual.json.etag } : { etag: '' }) };
const res = await call('POST', '/shippingSettings:insert', body);
say('');
if (!res.ok) { say(`Gravar o frete: ${erro(res)}`); finish(1); }
say('Frete gravado no Merchant Center.');
finish(0);
