#!/usr/bin/env node
/**
 * Espera o Firebase App Hosting terminar de publicar a versão nova depois de
 * um push na main, para quem roda em seguida conferir o site já com ela no
 * ar (.github/workflows/correios-cws.yml). O workflow de deploy termina
 * antes de o App Hosting acabar de compilar e trocar a versão.
 *
 * Ambiente: ACCESS_TOKEN (gcloud auth print-access-token), PROJECT_ID,
 * SITE_DOMAIN (padrão mikma.com.br), SINCE (ISO, quando o deploy começou),
 * MAX_WAIT_S (padrão 1500).
 * Nunca falha: se não der para saber, avisa no log e segue (a conferência
 * vale para a versão que estiver no ar).
 */
const API = 'https://firebaseapphosting.googleapis.com/v1beta';
const TOKEN = process.env.ACCESS_TOKEN;
const PROJECT = process.env.PROJECT_ID || 'mikma-lencois';
const DOMAIN = process.env.SITE_DOMAIN || 'mikma.com.br';
const since = Date.parse(process.env.SINCE || '');
const maxWaitMs = Number(process.env.MAX_WAIT_S || 1500) * 1000;
// Se em 5 minutos não apareceu rollout novo, esse push não gerou um.
const NO_ROLLOUT_MS = 5 * 60_000;
const DONE = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function list(path, key) {
  const items = [];
  let page = '';
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${API}/${path}?pageSize=50${page ? `&pageToken=${page}` : ''}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
    items.push(...(data[key] ?? []));
    if (!data.nextPageToken) break;
    page = data.nextPageToken;
  }
  return items;
}

/** O backend que atende o domínio da loja (pode haver um de teste). */
async function findBackend() {
  const backends = await list(`projects/${PROJECT}/locations/-/backends`, 'backends');
  if (backends.length === 1) return backends[0].name;
  for (const b of backends) {
    const domains = await list(`${b.name}/domains`, 'domains').catch(() => []);
    if (domains.some(d => [DOMAIN, `www.${DOMAIN}`].includes(String(d.name).split('/').pop()))) return b.name;
  }
  throw new Error(`nenhum backend com o domínio ${DOMAIN}`);
}

try {
  if (!TOKEN) throw new Error('ACCESS_TOKEN ausente');
  if (!Number.isFinite(since)) throw new Error('SINCE ausente: não é um deploy, confere a versão que está no ar');
  const backend = await findBackend();
  const started = Date.now();
  let last = '';
  for (;;) {
    // 2 minutos de folga: o relógio do rollout e o do GitHub não são o mesmo.
    const fresh = (await list(`${backend}/rollouts`, 'rollouts'))
      .filter(r => Date.parse(r.createTime) >= since - 120_000)
      .sort((a, b) => Date.parse(b.createTime) - Date.parse(a.createTime));
    const newest = fresh[0];
    const state = newest ? `${newest.name.split('/').pop()}: ${newest.state}` : 'nenhum rollout novo ainda';
    if (state !== last) { console.log(state); last = state; }
    if (newest && DONE.has(newest.state)) {
      // A troca de versão leva mais um instante depois do rollout concluir.
      if (newest.state === 'SUCCEEDED') await sleep(45_000);
      break;
    }
    if (!newest && Date.now() - started > NO_ROLLOUT_MS) { console.log('Sem rollout novo: segue com a versão que está no ar.'); break; }
    if (Date.now() - started > maxWaitMs) { console.log('Tempo esgotado esperando o rollout: segue com a versão que está no ar.'); break; }
    await sleep(20_000);
  }
} catch (err) {
  console.log(`Não deu para acompanhar o rollout (${String(err?.message ?? err)}): segue com a versão que está no ar.`);
}
