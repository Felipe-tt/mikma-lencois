#!/usr/bin/env node
/**
 * Confere o contrato da loja na API dos Correios (CWS): gera o token pelo
 * cartão de postagem e cota PAC e SEDEX para dois destinos. Roda depois de
 * cada deploy e todo dia (.github/workflows/correios-cws.yml): se o código
 * de acesso for regerado ou o contrato vencer, o site cai no preço do Melhor
 * Envio sem aviso nenhum, e é aqui que isso aparece.
 *
 * O repositório é público: só sai no log o que não é segredo (status HTTP,
 * preço, prazo, mensagem de erro dos Correios). Nunca o login ou o código.
 *
 * Uso: CORREIOS_CWS="login:codigo" CARTAO=0075520150 node scripts/correios-cws-teste.mjs
 * Ambiente opcional: CONTRATO, ORIGEM (CEP), TENTATIVAS (3), PAUSA_S (30).
 * Sai com 0 (tudo certo) ou 1 (falhou em todas as tentativas) e escreve
 * `verdict` (ok ou fail) e `detail` no GITHUB_OUTPUT.
 */
import { appendFileSync } from 'node:fs';

const API = 'https://api.correios.com.br';
const [user, ...rest] = (process.env.CORREIOS_CWS ?? '').split(':');
const code = rest.join(':');
const cartao = process.env.CARTAO ?? '';
const contrato = process.env.CONTRATO ?? '';
const origem = process.env.ORIGEM || '89042300';
const tentativas = Number(process.env.TENTATIVAS || 3);
const pausaMs = Number(process.env.PAUSA_S || 30) * 1000;

const destinos = { 'São Paulo': '01310100', Manaus: '69005000' };
const servicos = { PAC: '03298', SEDEX: '03220' };
// Jogo de cama king na caixa que o site usa para até 2 kg.
const pacote = { psObjeto: '1500', tpObjeto: '2', comprimento: '30', largura: '25', altura: '10' };

const out = [];
const say = s => { console.log(s); out.push(s); };
const safe = v => JSON.stringify(v ?? null).slice(0, 300);
const basic = (u, c) => `Basic ${Buffer.from(`${u}:${c}`).toString('base64')}`;

function finish(ok, detail) {
  say('');
  say(ok ? '## Tudo certo: token, preço e prazo do contrato' : `## Falhou: ${detail}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${ok ? 'ok' : 'fail'}\ndetail=${String(detail).replace(/\s+/g, ' ')}\n`);
  process.exit(ok ? 0 : 1);
}

/** Uma chamada que nunca lança: erro de rede vira status 0. */
async function call(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    return { status: res.status, ok: res.ok, body: await res.json().catch(() => ({})) };
  } catch (err) {
    return { status: 0, ok: false, body: { message: String(err?.message ?? err) } };
  }
}
const erro = r => safe(r.body.msgs ?? r.body.txErro ?? r.body.message ?? r.body);

/** Uma rodada completa. Devolve '' se deu tudo certo, ou o que falhou. */
async function rodada() {
  const auth = await call(`${API}/token/v1/autentica/cartaopostagem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: basic(user, code) },
    body: JSON.stringify({ numero: cartao }),
  });
  say(`Token pelo cartão de postagem: HTTP ${auth.status}`);
  if (!auth.ok || !auth.body.token) {
    say(`Erro: ${erro(auth)}`);
    // Diagnóstico sem expor nada: formato do secret e se o login vale sem o cartão.
    say(`Secret: login com ${user.length} caracteres, código com ${code.length}, espaço ou quebra de linha: ${/\s/.test(user + code) ? 'sim' : 'não'}`);
    const plain = await call(`${API}/token/v1/autentica`, { method: 'POST', headers: { Authorization: basic(user.trim(), code.trim()) } });
    say(`Token só com login e código (sem cartão): HTTP ${plain.status}${plain.ok ? '' : ` ${erro(plain)}`}`);
    return auth.status === 401 || auth.status === 403
      ? `os Correios recusaram o login ou o código de acesso (HTTP ${auth.status})`
      : `a API dos Correios não gerou o token (HTTP ${auth.status})`;
  }

  const dr = auth.body.cartaoPostagem?.dr ?? auth.body.dr;
  const nuContrato = auth.body.cartaoPostagem?.contrato ?? contrato;
  say(`expira em: ${auth.body.expiraEm ?? '?'} · contrato no token: ${nuContrato || '?'} · DR: ${dr ?? '?'}`);
  say(`APIs liberadas no token: ${safe(auth.body.cartaoPostagem?.api ?? auth.body.api ?? '?')}`);

  const bearer = { Authorization: `Bearer ${auth.body.token}` };
  const falhas = [];
  say('');
  say('Cotações (1,5 kg, 30x25x10 cm):');
  for (const [cidade, cep] of Object.entries(destinos)) {
    for (const [nome, co] of Object.entries(servicos)) {
      const q = new URLSearchParams({ cepOrigem: origem, cepDestino: cep, ...pacote, ...(nuContrato ? { nuContrato: String(nuContrato) } : {}), ...(dr ? { nuDR: String(dr) } : {}) });
      const p = await call(`${API}/preco/v1/nacional/${co}?${q}`, { headers: bearer });
      const t = await call(`${API}/prazo/v1/nacional/${co}?${new URLSearchParams({ cepOrigem: origem, cepDestino: cep })}`, { headers: bearer });
      const reais = Number(String(p.body.pcFinal ?? '').replace(/\./g, '').replace(',', '.'));
      const dias = Number(t.body.prazoEntrega);
      if (!p.ok || !(reais > 0) || !t.ok || !(dias > 0)) falhas.push(`${cidade} · ${nome}`);
      say(`- ${cidade} · ${nome} (${co}): preço HTTP ${p.status} ${p.body.pcFinal ?? erro(p)} · prazo HTTP ${t.status} ${dias > 0 ? `${dias} ${dias === 1 ? 'dia' : 'dias'}` : erro(t)}`);
    }
  }
  return falhas.length ? `sem preço ou prazo do contrato para ${falhas.join(', ')}` : '';
}

if (!user || !code || !cartao) finish(false, 'faltam CORREIOS_CWS (login:codigo) ou CARTAO');

let detail = '';
for (let i = 1; i <= tentativas; i++) {
  say(`## Tentativa ${i} de ${tentativas}`);
  detail = await rodada();
  if (!detail) break;
  if (i < tentativas) { say(''); await new Promise(r => setTimeout(r, pausaMs)); }
}
finish(!detail, detail);
