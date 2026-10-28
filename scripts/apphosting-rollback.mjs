#!/usr/bin/env node
/**
 * Volta o site para a versão anterior no Firebase App Hosting, reaproveitando
 * o build já pronto (sem recompilar: leva poucos minutos). Chamado pelo
 * workflow saude-site.yml quando o site falha logo depois de um deploy.
 *
 * Ambiente: ACCESS_TOKEN (gcloud auth print-access-token), PROJECT_ID,
 * SITE_DOMAIN (padrão mikma.com.br), DRY_RUN=1 só decide e mostra.
 */
import { appendFileSync } from 'node:fs';
import { decideRollback, AUTO_PREFIX } from './lib/rollback-decision.mjs';

const API = 'https://firebaseapphosting.googleapis.com/v1beta';
const TOKEN = process.env.ACCESS_TOKEN;
const PROJECT = process.env.PROJECT_ID || 'mikma-lencois';
const DOMAIN = process.env.SITE_DOMAIN || 'mikma.com.br';
const DRY = process.env.DRY_RUN === '1';

function out(key, value) {
  console.log(`${key}: ${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${String(value).replace(/\n/g, ' ')}\n`);
}

async function api(path, init = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

async function listAll(path, key) {
  const items = [];
  let token = '';
  for (let i = 0; i < 10; i++) {
    const data = await api(`${path}${path.includes('?') ? '&' : '?'}pageSize=50${token ? `&pageToken=${token}` : ''}`);
    items.push(...(data[key] ?? []));
    if (!data.nextPageToken) break;
    token = data.nextPageToken;
  }
  return items;
}

/** O backend que atende o domínio da loja (pode haver um de teste). */
async function findBackend() {
  const backends = await listAll(`projects/${PROJECT}/locations/-/backends`, 'backends');
  if (backends.length === 1) return backends[0].name;
  for (const b of backends) {
    const domains = await listAll(`${b.name}/domains`, 'domains').catch(() => []);
    if (domains.some(d => [DOMAIN, `www.${DOMAIN}`].includes(String(d.name).split('/').pop()))) return b.name;
  }
  throw new Error(`nenhum backend com o domínio ${DOMAIN} (backends: ${backends.map(b => b.name.split('/').pop()).join(', ')})`);
}

try {
  if (!TOKEN) throw new Error('ACCESS_TOKEN ausente');
  const backend = await findBackend();
  const rollouts = await listAll(`${backend}/rollouts`, 'rollouts');
  const decision = decideRollback(rollouts, Date.now());
  out('backend', backend.split('/').pop());
  if (decision.action !== 'rollback') {
    out('action', 'none');
    out('reason', decision.reason);
    process.exit(0);
  }
  out('from_build', decision.from.build.split('/').pop());
  out('to_build', decision.to.build.split('/').pop());
  if (DRY) {
    out('action', 'dry-run');
    process.exit(0);
  }
  const rolloutId = `${AUTO_PREFIX}${Date.now()}`;
  await api(`${backend}/rollouts?rolloutId=${rolloutId}`, { method: 'POST', body: JSON.stringify({ build: decision.to.build }) });
  out('action', 'rollback');
  out('rollout', rolloutId);
} catch (err) {
  out('action', 'error');
  out('reason', err?.message ?? String(err));
  process.exit(1);
}
