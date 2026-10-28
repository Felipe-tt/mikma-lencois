import { dueJobs, healthDue } from './schedule.mjs';

/**
 * Worker "mikma-cron": chama as rotinas da loja e confere a saúde do site
 * no horário certo. Segredos (wrangler secret, enviados pelo workflow
 * worker-cron.yml a partir dos secrets do GitHub):
 * - CRON_SECRET: autoriza as rotas /api/cron/*;
 * - EDGE_SHARED_SECRET: trava de origem (o site recusa quem não passou pela Cloudflare);
 * - GH_DISPATCH_TOKEN (opcional): token do GitHub só com "Actions: write"
 *   neste repositório; com ele, uma falha na saúde dispara o workflow
 *   saude-site.yml, que confirma e faz o rollback.
 */
const SITE = 'https://mikma.com.br';
const REPO = 'Felipe-tt/mikma-lencois';

async function call(env, path) {
  const started = Date.now();
  try {
    const res = await fetch(SITE + path, {
      headers: { 'x-cron-secret': env.CRON_SECRET, 'x-mikma-edge': env.EDGE_SHARED_SECRET ?? '', 'user-agent': 'MikmaCron/1.0 (+cloudflare-worker)' },
      signal: AbortSignal.timeout(25_000),
    });
    const body = (await res.text()).slice(0, 300);
    return { path, status: res.status, ms: Date.now() - started, body };
  } catch (err) {
    return { path, status: 0, ms: Date.now() - started, body: String(err?.message ?? err) };
  }
}

async function health(env) {
  const r = await call(env, '/api/cron/health');
  let data = {};
  try { data = JSON.parse(r.body); } catch { /* corpo cortado ou não-JSON */ }
  const ok = r.status === 200 && (data.ok ?? /"ok":true/.test(r.body));
  // 403/429: bloqueio da Cloudflare, não site fora.
  const blocked = r.status === 403 || r.status === 429;
  if (ok || blocked || !env.GH_DISPATCH_TOKEN) return { ...r, ok, dispatched: false };
  // Site com problema: o workflow do GitHub repete o teste e decide o rollback.
  const gh = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/saude-site.yml/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'MikmaCron/1.0',
    },
    body: JSON.stringify({ ref: 'main', inputs: { dry_run: 'false' } }),
  }).catch(() => null);
  return { ...r, ok, dispatched: gh?.status === 204 };
}

export default {
  async scheduled(event, env, ctx) {
    const when = new Date(event.scheduledTime);
    const tasks = dueJobs(when).map(path => call(env, path));
    if (healthDue(when)) tasks.push(health(env));
    if (!tasks.length) return;
    const results = await Promise.all(tasks);
    // Aparece no log do Worker (Cloudflare → Workers → mikma-cron → Logs).
    for (const r of results) console.log(JSON.stringify({ at: when.toISOString(), ...r }));
    const failed = results.filter(r => r.status !== 200);
    if (failed.length) throw new Error(`rotinas com erro: ${failed.map(r => `${r.path} ${r.status}`).join(', ')}`);
  },
};
