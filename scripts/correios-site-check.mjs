#!/usr/bin/env node
/**
 * Confere no site publicado se o servidor cota PAC e SEDEX pelo contrato dos
 * Correios: GET /api/cron/health?correios=1 com o CRON_SECRET. É o que prova
 * que a versão no ar tem o secret, o cartão e o CEP de origem certos (o
 * teste direto do contrato, scripts/correios-cws-teste.mjs, não passa pelo
 * site).
 *
 * Veredito no GITHUB_OUTPUT (`verdict` e `detail`):
 *   ok           o site gerou o token, cotou PAC e SEDEX e tem os dados da
 *                loja que a etiqueta precisa (CNPJ e endereço da coleta)
 *   fail         o site respondeu, mas sem token ou sem preço
 *   inconclusive bloqueio da Cloudflare, segredo fora de sincronia, site fora
 *                do ar (o monitor de saúde cuida) ou versão no ar ainda sem
 *                essa conferência
 * Sai com 1 só no fail, depois de TENTATIVAS (3) rodadas com PAUSA_S (30).
 * Lê SITE_URL (padrão https://mikma.com.br), CRON_SECRET e, só em teste
 * local, HEALTH_EXTRA_HEADER ("nome: valor").
 */
import { appendFileSync } from 'node:fs';

const BASE = process.env.SITE_URL || 'https://mikma.com.br';
const SECRET = process.env.CRON_SECRET || '';
const tentativas = Number(process.env.TENTATIVAS || 3);
const pausaMs = Number(process.env.PAUSA_S || 30) * 1000;
const EXTRA = process.env.HEALTH_EXTRA_HEADER?.match(/^([^:]+):\s*(.*)$/);
const reais = cents => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

const out = [];
const say = s => { console.log(s); out.push(s); };

function finish(verdict, detail) {
  say('');
  say(verdict === 'ok' ? `## Site publicado: ${detail}` : verdict === 'fail' ? `## Falhou no site publicado: ${detail}` : `## Sem conclusão: ${detail}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${verdict}\ndetail=${String(detail).replace(/\s+/g, ' ')}\n`);
  process.exit(verdict === 'fail' ? 1 : 0);
}

/** Uma rodada: devolve [veredito, detalhe]. */
async function rodada() {
  let res;
  let data = {};
  try {
    res = await fetch(`${BASE}/api/cron/health?correios=1`, {
      headers: { 'user-agent': 'MikmaHealthCheck/1.0 (+github-actions)', 'x-cron-secret': SECRET, ...(EXTRA ? { [EXTRA[1].trim()]: EXTRA[2] } : {}) },
      signal: AbortSignal.timeout(60_000),
    });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    return ['inconclusive', `o site não respondeu (${String(err?.message ?? err)})`];
  }
  if (res.status === 403 || res.status === 429) return ['inconclusive', `bloqueio da Cloudflare (HTTP ${res.status})`];
  if (res.status === 401 || res.status === 404) return ['inconclusive', `segredo ou rota fora de sincronia (HTTP ${res.status})`];
  const c = data.correios;
  if (!c) return ['inconclusive', res.status >= 500 && data.ok === undefined ? `o site respondeu HTTP ${res.status}` : 'a versão no ar ainda não informa os Correios'];
  if (!c.configured) return ['fail', 'o site está sem o secret CORREIOS_CWS ou sem o cartão de postagem (CORREIOS_CARTAO)'];
  if (!c.token) return ['fail', 'o site não conseguiu gerar o token dos Correios com o código de acesso'];
  if (!(c.pacCents > 0) || !(c.sedexCents > 0)) return ['fail', `o site gerou o token, mas ficou sem preço do contrato (PAC ${reais(c.pacCents || 0)}, SEDEX ${reais(c.sedexCents || 0)}); confira o CEP de origem nas Configurações`];
  if (c.etiqueta?.length) return ['fail', `o frete funciona, mas a etiqueta não vai sair: ${c.etiqueta.join(' ')}`];
  return ['ok', `PAC ${reais(c.pacCents)} e SEDEX ${reais(c.sedexCents)} pelo contrato (1,5 kg até São Paulo); dados da loja para a etiqueta completos`];
}

if (!SECRET) finish('inconclusive', 'CRON_SECRET ausente');

let result = ['inconclusive', ''];
for (let i = 1; i <= tentativas; i++) {
  result = await rodada();
  say(`Tentativa ${i} de ${tentativas}: ${result[0]} · ${result[1]}`);
  if (result[0] === 'ok') break;
  if (i < tentativas) await new Promise(r => setTimeout(r, pausaMs));
}
finish(result[0], result[1]);
