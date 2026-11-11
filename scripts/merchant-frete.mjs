#!/usr/bin/env node
/**
 * Frete da loja no Merchant Center (Merchant API v1): três regiões por faixa
 * de CEP e preço por peso, tirado do PAC do contrato até as capitais e
 * arredondado para cima. Sem argumento só mostra o que está lá; com
 * APLICAR=1 grava (substitui os serviços de frete da conta).
 *
 *   MERCHANT_ID=5900898574 MERCHANT_TOKEN=... [APLICAR=1] node scripts/merchant-frete.mjs
 */
import { appendFileSync } from 'node:fs';

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

// Faixas de CEP por prefixo (o Google recusa o CEP com hífen): Sul (PR, SC,
// RS: 80 a 99), Sudeste (SP, RJ, ES, MG: 01 a 39) e o resto (40 a 79).
const REGIOES = [
  { id: '8001', nome: 'Sul', faixas: [['80*', '99*']] },
  { id: '8002', nome: 'SP, RJ, MG e ES', faixas: [['01*', '39*']] },
  { id: '8003', nome: 'Demais estados', faixas: [['40*', '79*']] },
];
// Reais por faixa de peso: até 2 kg, de 2 a 5 kg, acima de 5 kg.
const PRECOS = { 8001: [21, 29, 36], 8002: [27, 41, 50], 8003: [37, 56, 70] };
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
if (!APLICAR) { say(''); say('Só leitura. Rode com aplicar = true para gravar.'); finish(0); }

// 2. Regiões por CEP (cria ou atualiza). A tabela de frete só aceita ID
// numérico de local, então as regiões têm ID numérico.
for (const r of REGIOES) {
  const region = {
    displayName: r.nome,
    postalCodeArea: { regionCode: 'BR', postalCodes: r.faixas.map(([begin, end]) => ({ begin, end })) },
  };
  const existe = await call('GET', `/regions/${r.id}`);
  const res = existe.ok
    ? await call('PATCH', `/regions/${r.id}?updateMask=displayName,postalCodeArea`, region)
    : await call('POST', `/regions?regionId=${r.id}`, region);
  if (!res.ok) { say(`Região ${r.nome}: ${erro(res)}`); finish(1); }
  say(`Região ${r.nome}: ok.`);
}

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
      rowHeaders: { locations: REGIOES.map(r => ({ locationIds: [r.id] })) },
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
