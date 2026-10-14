/**
 * Politica de senha alinhada ao NIST SP 800-63B Rev. 4 e ao OWASP:
 * tamanho minimo, sem regras de composicao (maiuscula, numero, simbolo),
 * bloqueio de senhas vazadas (Have I Been Pwned, k-anonymity) e estimativa
 * de forca com zxcvbn-ts (dicionarios em pt-br).
 *
 * Os dicionarios sao pesados, entao tudo e carregado sob demanda no primeiro uso.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
/** zxcvbn: 0 (trivial) a 4 (muito forte). Abaixo disso a senha e recusada. */
export const PASSWORD_MIN_SCORE = 2;

export type PasswordReport = {
  ok: boolean;
  /** 0 a 4 (zxcvbn). */
  score: number;
  /** Mensagem de erro principal quando ok = false. */
  error?: string;
  /** Dicas de melhoria (podem existir mesmo quando ok = true). */
  suggestions: string[];
  /** true se a senha aparece em vazamentos conhecidos. */
  pwned: boolean;
};

type Checker = import('@zxcvbn-ts/core').ZxcvbnFactory;
let ready: Promise<Checker> | null = null;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(3000) });
}

function loadChecker(): Promise<Checker> {
  if (!ready) {
    ready = (async () => {
      const [core, common, ptBr, pwned] = await Promise.all([
        import('@zxcvbn-ts/core'),
        import('@zxcvbn-ts/language-common'),
        import('@zxcvbn-ts/language-pt-br'),
        import('@zxcvbn-ts/matcher-pwned'),
      ]);
      // Falha de rede na consulta ao HIBP = ignora a checagem (nao bloqueia o cadastro).
      return new core.ZxcvbnFactory(
        {
          translations: ptBr.translations,
          graphs: common.adjacencyGraphs,
          dictionary: { ...common.dictionary, ...ptBr.dictionary },
        },
        { pwned: pwned.matcherPwnedFactory(fetchWithTimeout) },
      );
    })().catch(err => { ready = null; throw err; });
  }
  return ready;
}

/** Partes do e-mail e do nome que nao devem aparecer na senha (termos de contexto, NIST 800-63B). */
function userInputsFrom(email?: string, name?: string): string[] {
  const out: string[] = [];
  if (email) out.push(...email.toLowerCase().split(/[@._+\-]/).filter(p => p.length >= 3));
  if (name) out.push(...name.toLowerCase().split(/\s+/).filter(p => p.length >= 3));
  return out;
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function containsContextTerm(password: string, terms: string[]): boolean {
  const pw = fold(password);
  return terms.map(fold).some(t => t.length >= 4 && pw.includes(t));
}

export async function checkPassword(
  password: string,
  ctx: { email?: string; name?: string } = {},
): Promise<PasswordReport> {
  const base = { score: 0, suggestions: [] as string[], pwned: false };
  if (!password) return { ...base, ok: false, error: 'Crie uma senha.' };
  if (password.length < PASSWORD_MIN) {
    return { ...base, ok: false, error: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.` };
  }
  if (password.length > PASSWORD_MAX) {
    return { ...base, ok: false, error: `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.` };
  }
  let checker: Checker;
  try {
    checker = await loadChecker();
  } catch {
    // Nao conseguiu carregar os dicionarios: mantem so a regra de tamanho.
    return { ...base, ok: true, score: PASSWORD_MIN_SCORE };
  }
  const r = await checker.checkAsync(password, userInputsFrom(ctx.email, ctx.name));
  const pwned = r.sequence.some(s => s.pattern === 'pwned');
  const suggestions = [...(r.feedback.warning ? [r.feedback.warning] : []), ...r.feedback.suggestions];
  if (pwned) {
    return { ok: false, score: 0, pwned: true, suggestions, error: 'Essa senha já apareceu em vazamentos de dados. Escolha outra.' };
  }
  // Senha mediana que carrega o nome ou o e-mail da pessoa: recusa. Frases longas e muito fortes passam.
  if (r.score < 4 && containsContextTerm(password, userInputsFrom(ctx.email, ctx.name))) {
    return { ok: false, score: r.score, pwned: false, suggestions, error: 'A senha não deve conter seu nome ou e-mail.' };
  }
  if (r.score < PASSWORD_MIN_SCORE) {
    return { ok: false, score: r.score, pwned: false, suggestions, error: 'Senha fraca demais. Use uma frase longa ou palavras sem relação entre si.' };
  }
  return { ok: true, score: r.score, pwned: false, suggestions };
}
