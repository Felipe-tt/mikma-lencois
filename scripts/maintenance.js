#!/usr/bin/env node
// scripts/maintenance.js
// Uso:
//   node scripts/maintenance.js on             → ativa manutenção
//   node scripts/maintenance.js off            → desativa manutenção
//   node scripts/maintenance.js allow          → libera seu IP atual
//   node scripts/maintenance.js allow 1.2.3.4  → libera IP específico
//   node scripts/maintenance.js status         → mostra status + fila
//
// Requer autenticação: rode `gcloud auth application-default login` uma vez
// (ou já tenha credenciais padrão configuradas) antes de usar este script.
// Precisa do pacote firebase-admin instalado (já é dependência do projeto:
// rode a partir da raiz do repo, ou `npm install` dentro de scripts/ se for
// usar fora daqui).

const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const https = require('https');

const PROJECT = 'mikma-lencois';

function getDb() {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  }
  return getFirestore();
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

function ipToDocId(ip) {
  // Precisa bater exatamente com o middleware (src/middleware.ts), que
  // substitui '.' E ':' — IPv6 tem ':', e um descompasso aqui faz o
  // 'allow' nunca encontrar/liberar o documento certo.
  return ip.replace(/[.:]/g, '_');
}

async function main() {
  const [, , cmd, arg] = process.argv;
  let db;
  try {
    db = getDb();
  } catch (err) {
    console.error('\n❌ Não foi possível autenticar com o Firebase.');
    console.error('   Rode primeiro: gcloud auth application-default login');
    console.error(`   Detalhe: ${err.message}\n`);
    process.exit(1);
  }

  if (!cmd || cmd === 'status') {
    console.log('\n🔍 Buscando status...\n');
    const snap = await db.doc('maintenance/status').get();
    if (!snap.exists) {
      console.log('✅ Manutenção: DESATIVADA (documento não encontrado)\n');
    } else {
      const data = snap.data();
      const active = data.active ?? false;
      console.log(`${active ? '🔧 Manutenção: ATIVADA' : '✅ Manutenção: DESATIVADA'}`);
      if (data.updatedBy) console.log(`   Alterado por: ${data.updatedBy}`);
      if (data.updatedAt) console.log(`   Em: ${new Date(data.updatedAt).toLocaleString('pt-BR')}`);
    }

    const queueSnap = await db.collection('maintenance_queue')
      .orderBy('enteredAt', 'desc').limit(50).get();
    if (!queueSnap.empty) {
      const waiting = queueSnap.docs.filter(d => !d.data().released);
      console.log(`\n📋 Fila: ${waiting.length} aguardando de ${queueSnap.size} total\n`);
    }
    console.log('');
    return;
  }

  if (cmd === 'on') {
    console.log('\n🔧 Ativando manutenção...\n');
    await db.doc('maintenance/status').set({
      active: true,
      updatedAt: new Date().toISOString(),
      updatedBy: 'firebase-cli',
    }, { merge: true });
    console.log('✅ Site em modo manutenção.\n');
    return;
  }

  if (cmd === 'off') {
    console.log('\n🟢 Desativando manutenção...\n');
    await db.doc('maintenance/status').set({
      active: false,
      updatedAt: new Date().toISOString(),
      updatedBy: 'firebase-cli',
    }, { merge: true });
    console.log('✅ Site reativado normalmente.\n');
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
    await db.doc(`maintenance_queue/${docId}`).set({
      ip,
      released: true,
      releasedAt: new Date().toISOString(),
      releasedBy: 'firebase-cli',
      enteredAt: new Date().toISOString(),
    }, { merge: true });
    console.log(`✅ IP ${ip} liberado. Pode acessar o site normalmente.\n`);
    return;
  }

  console.log(`
Uso:
  node scripts/maintenance.js on             → ativa manutenção
  node scripts/maintenance.js off            → desativa manutenção
  node scripts/maintenance.js allow          → libera seu IP atual
  node scripts/maintenance.js allow 1.2.3.4  → libera IP específico
  node scripts/maintenance.js status         → mostra status atual
`);
}

main().catch(err => {
  console.error('\n❌ Erro:', err.message, '\n');
  process.exit(1);
});
