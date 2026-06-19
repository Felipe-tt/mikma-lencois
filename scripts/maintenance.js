#!/usr/bin/env node
// scripts/maintenance.js
// Uso:
//   node scripts/maintenance.js on          → ativa manutenção
//   node scripts/maintenance.js off         → desativa manutenção
//   node scripts/maintenance.js allow       → libera seu IP atual
//   node scripts/maintenance.js allow 1.2.3.4  → libera IP específico
//   node scripts/maintenance.js status      → mostra status + fila

const { execSync } = require('child_process');
const https = require('https');

const PROJECT = 'mikma-lencois';

function firestoreSet(docPath, data) {
  const json = JSON.stringify(data);
  execSync(
    `firebase firestore:set --project ${PROJECT} ${docPath} '${json}'`,
    { stdio: 'inherit' }
  );
}

function firestoreGet(docPath) {
  try {
    const out = execSync(
      `firebase firestore:get --project ${PROJECT} ${docPath} 2>/dev/null`,
      { encoding: 'utf8' }
    );
    return JSON.parse(out);
  } catch { return null; }
}

function getMyIp() {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    }).on('error', reject);
  });
}

function ipToDocId(ip) {
  return ip.replace(/[./]/g, '_');
}

async function main() {
  const [,, cmd, arg] = process.argv;

  if (!cmd || cmd === 'status') {
    console.log('\n🔍 Buscando status...\n');
    const status = firestoreGet('maintenance/status');
    if (!status) {
      console.log('✅ Manutenção: DESATIVADA (documento não encontrado)\n');
    } else {
      const active = status.active ?? false;
      console.log(`${active ? '🔧 Manutenção: ATIVADA' : '✅ Manutenção: DESATIVADA'}`);
      if (status.updatedBy) console.log(`   Alterado por: ${status.updatedBy}`);
      if (status.updatedAt) console.log(`   Em: ${new Date(status.updatedAt).toLocaleString('pt-BR')}`);
    }
    console.log('');
    return;
  }

  if (cmd === 'on') {
    console.log('\n🔧 Ativando manutenção...\n');
    firestoreSet('maintenance/status', {
      active: true,
      updatedAt: new Date().toISOString(),
      updatedBy: 'firebase-cli',
    });
    console.log('\n✅ Site em modo manutenção.\n');
    return;
  }

  if (cmd === 'off') {
    console.log('\n🟢 Desativando manutenção...\n');
    firestoreSet('maintenance/status', {
      active: false,
      updatedAt: new Date().toISOString(),
      updatedBy: 'firebase-cli',
    });
    console.log('\n✅ Site reativado normalmente.\n');
    return;
  }

  if (cmd === 'allow') {
    let ip = arg;
    if (!ip) {
      console.log('\n🌐 Detectando seu IP...');
      ip = await getMyIp();
      console.log(`   IP detectado: ${ip}`);
    }
    const docId = ipToDocId(ip);
    console.log(`\n🔓 Liberando IP ${ip}...\n`);
    firestoreSet(`maintenance_queue/${docId}`, {
      ip,
      released: true,
      releasedAt: new Date().toISOString(),
      releasedBy: 'firebase-cli',
      enteredAt: new Date().toISOString(),
    });
    console.log(`\n✅ IP ${ip} liberado. Pode acessar o site normalmente.\n`);
    return;
  }

  console.log(`
Uso:
  node scripts/maintenance.js on           → ativa manutenção
  node scripts/maintenance.js off          → desativa manutenção
  node scripts/maintenance.js allow        → libera seu IP atual
  node scripts/maintenance.js allow 1.2.3.4 → libera IP específico
  node scripts/maintenance.js status       → mostra status atual
`);
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
