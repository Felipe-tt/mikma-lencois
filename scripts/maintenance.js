#!/usr/bin/env node
// scripts/maintenance.js
// Uso:
//   node scripts/maintenance.js on             → ativa manutenção
//   node scripts/maintenance.js off            → desativa manutenção
//   node scripts/maintenance.js allow          → libera seu IP atual
//   node scripts/maintenance.js allow 1.2.3.4  → libera IP específico
//   node scripts/maintenance.js status         → mostra status + fila
//
// Autenticação: pede seu e-mail e senha de vendedor (os mesmos que você
// usa pra entrar no painel em /painel) e chama a API do próprio site —
// exatamente como o botão "Ativar manutenção" no painel faz. Não precisa
// de gcloud, nem de service account, nem de .env.local: só do login que
// você já tem.
//
// Variáveis de ambiente opcionais:
//   SITE_URL                  → padrão: https://mikma.com.br
//   NEXT_PUBLIC_FIREBASE_API_KEY → se não setada, pede pra colar na hora
//   MIKMA_EMAIL / MIKMA_PASSWORD → evita digitar toda vez (uso local apenas)

const https = require('https');
const readline = require('readline');

const SITE_URL = process.env.SITE_URL || 'https://mikma.com.br';

function prompt(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!hidden) {
      rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
      return;
    }
    // Esconde a senha digitada no terminal
    const stdin = process.stdin;
    process.stdout.write(question);
    let input = '';
    const onData = char => {
      const c = char.toString('utf8');
      if (c === '\n' || c === '\r' || c === '\u0004') {
        stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(input);
        return;
      }
      if (c === '\u0003') process.exit(1); // Ctrl+C
      if (c === '\u007f') { input = input.slice(0, -1); return; } // backspace
      input += c;
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

function httpsJson(url, options, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...options.headers,
      },
    }, res => {
      let chunks = '';
      res.on('data', c => (chunks += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(chunks); } catch { parsed = chunks; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function login() {
  let apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    apiKey = await prompt('Cole o NEXT_PUBLIC_FIREBASE_API_KEY do projeto (acha no .env.local ou nas configs do Firebase): ');
  }
  const email = process.env.MIKMA_EMAIL || await prompt('E-mail (login do painel): ');
  const password = process.env.MIKMA_PASSWORD || await prompt('Senha: ', { hidden: true });

  console.log('\n🔑 Autenticando...');
  const result = await httpsJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    { method: 'POST' },
    { email, password, returnSecureToken: true }
  ).catch(err => {
    throw new Error(`Login falhou — confira e-mail/senha e a API key. (${err.message})`);
  });

  return result.idToken;
}

async function callApi(idToken, body) {
  return httpsJson(
    `${SITE_URL}/api/maintenance`,
    { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } },
    body
  );
}

async function getStatus(idToken) {
  return new Promise((resolve, reject) => {
    const req = https.request(`${SITE_URL}/api/maintenance`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
    }, res => {
      let chunks = '';
      res.on('data', c => (chunks += c));
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getMyIp() {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org', res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve(data.trim()));
    }).on('error', reject);
  });
}

async function main() {
  const [, , cmd, arg] = process.argv;

  if (!cmd || !['on', 'off', 'allow', 'status'].includes(cmd)) {
    console.log(`
Uso:
  node scripts/maintenance.js on             → ativa manutenção
  node scripts/maintenance.js off            → desativa manutenção
  node scripts/maintenance.js allow          → libera seu IP atual
  node scripts/maintenance.js allow 1.2.3.4  → libera IP específico
  node scripts/maintenance.js status         → mostra status atual

Site alvo: ${SITE_URL}  (mude com a variável de ambiente SITE_URL)
`);
    return;
  }

  let idToken;
  try {
    idToken = await login();
  } catch (err) {
    console.error('\n❌', err.message, '\n');
    process.exit(1);
  }

  try {
    if (cmd === 'status') {
      console.log('\n🔍 Buscando status...\n');
      const { status, queue } = await getStatus(idToken);
      const active = status?.active ?? false;
      console.log(`${active ? '🔧 Manutenção: ATIVADA' : '✅ Manutenção: DESATIVADA'}`);
      if (status?.updatedBy) console.log(`   Alterado por: ${status.updatedBy}`);
      if (status?.updatedAt) console.log(`   Em: ${new Date(status.updatedAt).toLocaleString('pt-BR')}`);
      const waiting = (queue ?? []).filter(e => !e.released);
      console.log(`\n📋 Fila: ${waiting.length} aguardando de ${(queue ?? []).length} total\n`);
      return;
    }

    if (cmd === 'on' || cmd === 'off') {
      // O endpoint só tem "toggle" — busca o status atual primeiro pra
      // saber se já está no estado desejado (evita inverter sem querer).
      const { status } = await getStatus(idToken);
      const currentlyActive = status?.active ?? false;
      const wantActive = cmd === 'on';

      if (currentlyActive === wantActive) {
        console.log(`\n${wantActive ? '🔧 Manutenção já estava ATIVADA' : '✅ Site já estava DESATIVADO (sem manutenção)'} — nada a fazer.\n`);
        return;
      }

      console.log(`\n${wantActive ? '🔧 Ativando' : '🟢 Desativando'} manutenção...\n`);
      await callApi(idToken, { action: 'toggle' });
      console.log(`✅ ${wantActive ? 'Site em modo manutenção.' : 'Site reativado normalmente.'}`);
      if (wantActive) console.log('⚠️  Pode levar alguns segundos pro cache de páginas invalidar.');
      console.log('');
      return;
    }

    if (cmd === 'allow') {
      let ip = arg;
      if (!ip) {
        console.log('\n🌐 Detectando seu IP...');
        ip = await getMyIp();
        console.log(`   IP detectado: ${ip}`);
      }
      console.log(`\n🔓 Liberando IP ${ip}...\n`);
      await callApi(idToken, { action: 'release', ip });
      console.log(`✅ IP ${ip} liberado. Pode acessar o site normalmente.\n`);
      return;
    }
  } catch (err) {
    console.error('\n❌ Erro ao chamar a API:', err.message, '\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌ Erro:', err.message, '\n');
  process.exit(1);
});
