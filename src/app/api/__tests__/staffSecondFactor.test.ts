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
