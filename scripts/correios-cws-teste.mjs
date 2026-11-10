#!/usr/bin/env node
/**
 * Teste do acesso à API dos Correios (CWS) com o contrato da loja: gera o
 * token pelo cartão de postagem e cota PAC e SEDEX para dois destinos. O
 * repositório é público: só sai no log o que não é segredo (status HTTP,
 * preço, prazo, mensagem de erro dos Correios). Nunca o login ou o código.
 *
 * Uso: CORREIOS_CWS="login:codigo" CARTAO=0075520150 node scripts/correios-cws-teste.mjs
 */
import { appendFileSync } from 'node:fs';

const [user, ...rest] = (process.env.CORREIOS_CWS ?? '').split(':');
const code = rest.join(':');
const cartao = process.env.CARTAO ?? '';
const contrato = process.env.CONTRATO ?? '';
const out = [];
const say = s => { console.log(s); out.push(s); };
if (!user || !code || !cartao) { say('Faltam CORREIOS_CWS (login:codigo) ou CARTAO.'); process.exit(1); }

const API = 'https://api.correios.com.br';
const safe = v => JSON.stringify(v).slice(0, 400);

const auth = await fetch(`${API}/token/v1/autentica/cartaopostagem`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${user}:${code}`).toString('base64')}` },
  body: JSON.stringify({ numero: cartao }),
});
const authBody = await auth.json().catch(() => ({}));
say(`## Token pelo cartão de postagem: HTTP ${auth.status}`);
if (!auth.ok || !authBody.token) {
  say(`Erro: ${safe(authBody.msgs ?? authBody.message ?? authBody)}`);
  // Diagnóstico sem expor nada: formato do secret e se o login vale sem o cartão.
  say(`Secret: login com ${user.length} caracteres, código com ${code.length}, espaço ou quebra de linha: ${/\s/.test(user + code) ? 'sim' : 'não'}`);
  const plain = await fetch(`${API}/token/v1/autentica`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${user.trim()}:${code.trim()}`).toString('base64')}` },
  });
  const plainBody = await plain.json().catch(() => ({}));
  say(`Token só com login e código (sem cartão): HTTP ${plain.status}${plain.ok ? '' : ` ${safe(plainBody.msgs ?? plainBody.message ?? plainBody)}`}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
  process.exit(1);
}
const token = authBody.token;
const dr = authBody.cartaoPostagem?.dr ?? authBody.dr;
const nuContrato = authBody.cartaoPostagem?.contrato ?? contrato;
say(`expira em: ${authBody.expiraEm ?? '?'} · contrato no token: ${nuContrato || '?'} · DR: ${dr ?? '?'}`);
say(`APIs liberadas no token: ${safe(authBody.cartaoPostagem?.api ?? authBody.api ?? '?')}`);

const bearer = { Authorization: `Bearer ${token}` };
const origem = '89042300';
const destinos = { 'São Paulo': '01310100', Manaus: '69005000' };
const servicos = { 'PAC contrato': '03298', 'SEDEX contrato': '03220' };
const pacote = { psObjeto: '1500', tpObjeto: '2', comprimento: '30', largura: '25', altura: '10' };

const pacotes = {
  'jogo king, 1,5 kg, 30x25x10 cm': pacote,
  'caixa padrão do site, 1,5 kg, 50x40x20 cm': { ...pacote, comprimento: '50', largura: '40', altura: '20' },
};
for (const [nomePacote, dims] of Object.entries(pacotes)) {
say('');
say(`## Cotações (${nomePacote})`);
for (const [cidade, cep] of Object.entries(destinos)) {
  for (const [nome, co] of Object.entries(servicos)) {
    const q = new URLSearchParams({ cepOrigem: origem, cepDestino: cep, ...dims, ...(nuContrato ? { nuContrato: String(nuContrato) } : {}), ...(dr ? { nuDR: String(dr) } : {}) });
    const p = await fetch(`${API}/preco/v1/nacional/${co}?${q}`, { headers: bearer });
    const pb = await p.json().catch(() => ({}));
    const t = await fetch(`${API}/prazo/v1/nacional/${co}?${new URLSearchParams({ cepOrigem: origem, cepDestino: cep })}`, { headers: bearer });
    const tb = await t.json().catch(() => ({}));
    say(`- ${cidade} · ${nome} (${co}): preço HTTP ${p.status} ${pb.pcFinal ?? safe(pb.msgs ?? pb.txErro ?? pb)} · prazo HTTP ${t.status} ${tb.prazoEntrega ?? safe(tb.msgs ?? tb.txErro ?? tb)} dias`);
    if (p.ok && !process.env.MOSTROU) { say(`  campos da resposta de preço: ${Object.keys(pb).join(', ')}`); process.env.MOSTROU = '1'; }
  }
}
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
