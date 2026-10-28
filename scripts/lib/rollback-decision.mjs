/**
 * Decide se dá para voltar o site para a versão anterior (App Hosting).
 * Puro, para ser testado (src/lib/ops/rollbackDecision.test.ts).
 *
 * Regras de segurança:
 * - só volta se a versão no ar é recente (deploy há menos de MAX_AGE): se o
 *   site quebrou com uma versão antiga, o problema não é o deploy;
 * - nunca volta de novo por cima de um rollback automático (sem laço);
 * - o destino é a última versão anterior que subiu com sucesso e é outro build.
 *
 * @param {Array<{name: string, build?: string, state?: string, createTime?: string}>} rollouts
 * @param {number} now ms
 * @returns {{ action: 'rollback', from: object, to: object } | { action: 'none', reason: string }}
 */
export const MAX_AGE_MS = 3 * 60 * 60 * 1000;
export const AUTO_PREFIX = 'auto-rollback-';

export function decideRollback(rollouts, now) {
  const ok = (rollouts ?? [])
    .filter(r => r && r.state === 'SUCCEEDED' && r.build && r.createTime)
    .sort((a, b) => Date.parse(b.createTime) - Date.parse(a.createTime));
  const current = ok[0];
  if (!current) return { action: 'none', reason: 'nenhuma versão no ar encontrada' };
  if (current.name.split('/').pop().startsWith(AUTO_PREFIX)) {
    return { action: 'none', reason: 'a versão no ar já é um rollback automático; precisa de alguém olhar' };
  }
  const age = now - Date.parse(current.createTime);
  if (age > MAX_AGE_MS) return { action: 'none', reason: `a versão no ar é de ${Math.round(age / 60000)} min atrás; o problema não parece ser o deploy` };
  const previous = ok.find(r => r.build !== current.build);
  if (!previous) return { action: 'none', reason: 'não há versão anterior para voltar' };
  return { action: 'rollback', from: current, to: previous };
}
