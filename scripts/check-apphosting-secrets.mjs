// Confere, sem ler o valor de nenhum secret, se cada secret do
// apphosting.yaml existe no Secret Manager, tem versão ativa e as
// permissões que o App Hosting precisa. Uso: node scripts/check-apphosting-secrets.mjs <apphosting.yaml>
import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { secretNames, missingBindings } from './lib/apphosting-secrets.mjs';

const file = process.argv[2] ?? 'apphosting.yaml';
const names = secretNames(readFileSync(file, 'utf8'));
const gcloud = args => JSON.parse(execFileSync('gcloud', [...args, '--format=json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || 'null');

const problems = [];
for (const name of names) {
  try {
    gcloud(['secrets', 'describe', name]);
  } catch (err) {
    const msg = String(err?.stderr ?? err);
    problems.push(/NOT_FOUND/.test(msg) ? `${name}: não existe no Secret Manager` : `${name}: não deu para conferir (${msg.trim().split('\n')[0]})`);
    continue;
  }
  const enabled = gcloud(['secrets', 'versions', 'list', name, '--filter=state=ENABLED', '--limit=1']);
  if (!enabled?.length) problems.push(`${name}: nenhuma versão ativa`);
  for (const b of missingBindings(gcloud(['secrets', 'get-iam-policy', name]))) {
    problems.push(`${name}: falta ${b.role} para ${b.member.replace('serviceAccount:', '')}`);
  }
}

const lines = [`## Secrets do App Hosting (${names.length})`, ''];
if (problems.length) {
  lines.push('O rollout vai falhar com "Secret configurado incorretamente":', '', ...problems.map(p => `- ${p}`), '',
    'Para corrigir, crie o secret e copie as permissões de um que funciona (ex.: ABACATEPAY_API_KEY), como faz o workflow "Infra · manutenção do Google Cloud".');
} else {
  lines.push(`Todos existem, têm versão ativa e as permissões do App Hosting: ${names.join(', ')}.`);
}
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
if (problems.length) {
  for (const p of problems) console.log(`::error file=${file}::${p}`);
  process.exit(1);
}
