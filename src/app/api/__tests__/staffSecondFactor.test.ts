import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Trava contra regressão: toda rota que confere se o usuário é da equipe
 * precisa exigir a segunda etapa (verifyAuth com roles, effectiveRole ou
 * hasSecondFactor). Uma rota que lê o papel direto do token deixaria quem
 * tem só a senha de alguém da equipe chamar a API sem a passkey.
 */
const API = join(process.cwd(), 'src/app/api');

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : routes(p);
    return name === 'route.ts' ? [p] : [];
  });
}

// Lê o papel do token da sessão (não de dados salvos ou do corpo).
const READS_ROLE_FROM_TOKEN = /(decoded|auth\.decoded)\s*(as\s*\{[^}]*\})?\)?\s*\.role\b/;
const ENFORCES_SECOND_FACTOR = /effectiveRole\(|hasSecondFactor\(|verifyAuth\([^)]*roles/;
// Leitura do papel só para exibir/registrar, depois de verifyAuth sem 2FA de propósito.
const ALLOWED = new Set(['auth/session/route.ts', 'auth/passkey/register/route.ts', 'painel/push-token/route.ts']);

describe('rotas da equipe exigem a segunda etapa', () => {
  const files = routes(API);
  it('encontra as rotas', () => expect(files.length).toBeGreaterThan(50));
  for (const file of files) {
    const rel = file.slice(API.length + 1);
    const src = readFileSync(file, 'utf8');
    if (!READS_ROLE_FROM_TOKEN.test(src) || ALLOWED.has(rel)) continue;
    it(rel, () => expect(src).toMatch(ENFORCES_SECOND_FACTOR));
  }
});

/**
 * Toda rota confere se o login foi revogado (verifyIdToken com true): sem
 * isso, quem saiu de todos os aparelhos, trocou a senha ou foi removido da
 * equipe seguiria usando a API até o token expirar (1 h). Exceção: as rotas
 * consultadas em loop pela tela do pedido, que conferem só para a equipe.
 */
const POLLING = new Set(['orders/[orderId]/check-payment/route.ts', 'orders/[orderId]/uber-sync/route.ts']);

/** Argumentos de cada chamada a verifyIdToken (com parênteses aninhados). */
function verifyCalls(src: string): string[] {
  const out: string[] = [];
  for (let i = src.indexOf('verifyIdToken('); i !== -1; i = src.indexOf('verifyIdToken(', i + 1)) {
    let depth = 0;
    let j = i + 'verifyIdToken'.length;
    for (; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')' && --depth === 0) break;
    }
    out.push(src.slice(i, j + 1));
  }
  return out;
}

describe('rotas conferem se o login foi revogado', () => {
  for (const file of routes(API)) {
    const rel = file.slice(API.length + 1);
    if (POLLING.has(rel)) continue;
    const calls = verifyCalls(readFileSync(file, 'utf8'));
    if (!calls.length) continue;
    it(rel, () => { for (const c of calls) expect(c).toMatch(/,\s*true\)$/); });
  }
});
