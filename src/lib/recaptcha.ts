/**
 * Verificação server-side da prova de humano: Cloudflare Turnstile
 * (TURNSTILE_SECRET_KEY) quando configurado, senão reCAPTCHA v3
 * (RECAPTCHA_SECRET_KEY). O cliente usa o mesmo provedor (ver
 * recaptcha-client.ts), escolhido pelas chaves públicas equivalentes.
 *
 * Antes desta correção, o campo `recaptchaToken` era aceito como opcional
 * no schema de /api/auth/register mas NUNCA verificado contra a API do
 * Google, nem sequer era gerado no frontend. Na prática não havia CAPTCHA
 * nenhum protegendo os formulários públicos, apesar de a infraestrutura
 * (env vars, CSP) já estar preparada para isso.
 *
 * Ref: relatorio-seguranca.md #2 (alto), plano-de-acao.md #2.
 */

interface SiteVerifyResponse {
  success: boolean;
  score?: number;       // v3: 0.0 (bot) a 1.0 (humano)
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

type Verdict =
  | { kind: 'off' }                      // nenhuma chave configurada
  | { kind: 'missing' }                  // chave configurada, token ausente
  | { kind: 'unavailable' }              // API fora do ar/timeout (fail-open)
  | { kind: 'checked'; ok: boolean; score?: number };

async function verifyToken(token: string | undefined, expectedAction: string): Promise<Verdict> {
  const turnstile = process.env.TURNSTILE_SECRET_KEY;
  const recaptcha = process.env.RECAPTCHA_SECRET_KEY;
  const secret = turnstile || recaptcha;
  if (!secret) return { kind: 'off' };
  if (!token) return { kind: 'missing' };
  const url = turnstile
    ? 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    : 'https://www.google.com/recaptcha/api/siteverify';
  // Turnstile só aceita letras, números, - e _ na ação (ver recaptcha-client.ts).
  const action = turnstile ? expectedAction.replace(/[^\w-]/g, '_').slice(0, 32) : expectedAction;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { kind: 'unavailable' };
    const data = (await res.json()) as SiteVerifyResponse;
    if (!data.success) return { kind: 'checked', ok: false };
    if (data.action && data.action !== action) return { kind: 'checked', ok: false };
    return { kind: 'checked', ok: true, score: typeof data.score === 'number' ? data.score : undefined };
  } catch {
    return { kind: 'unavailable' };
  }
}

/**
 * Verifica um token gerado no cliente.
 *
 * - Sem secret configurada (dev/CI): passa, não há o que verificar.
 * - Secret configurada e token AUSENTE: bloqueia. Antes isto passava, o que
 *   anulava o CAPTCHA: qualquer bot só precisava omitir o campo. O front
 *   sempre envia o token (ver recaptcha-client.ts); quem não consegue gerar
 *   (script bloqueado) recebe a mensagem para recarregar/desbloquear.
 * - Falha da API (rede/timeout/5xx): passa (fail-open), para um soluço de
 *   terceiros não derrubar cadastro/login. O atacante não controla isso, e
 *   o rate limiting continua valendo.
 * - Resposta dizendo que NÃO é humano (ou score do reCAPTCHA baixo): bloqueia.
 */
export async function verifyRecaptcha(
  token: string | undefined,
  expectedAction: string,
  minScore = 0.5
): Promise<boolean> {
  const v = await verifyToken(token, expectedAction);
  if (v.kind === 'off' || v.kind === 'unavailable') return true;
  if (v.kind === 'missing' || !v.ok) return false;
  return v.score === undefined || v.score >= minScore;
}

export type RecaptchaOutcome = 'pass' | 'challenge' | 'block';

/**
 * Versão em degraus da verificação, para fluxos que sabem lidar com um
 * meio-termo em vez de só passar/bloquear (hoje: login, via verificação
 * extra por e-mail).
 *
 * Turnstile: aprovado -> 'pass', reprovado -> 'block' (a própria Cloudflare
 * já pediu interação quando desconfiou). reCAPTCHA v3, pelo score:
 * score >= passScore (0.5)      -> 'pass'      segue normal, sem fricção
 * score >= challengeScore (0.3) -> 'challenge' pede confirmação por e-mail
 * score <  challengeScore       -> 'block'     rejeita, é bot com confiança alta
 *
 * Sem secret configurada -> 'pass'. Token ausente com secret configurada ->
 * 'challenge' (não 'pass'): quem não gerou token precisa provar posse do
 * e-mail, o que cobre o usuário com script bloqueado sem deixar bot omitir
 * o campo. Erro de rede -> 'pass' (fail-open, como em verifyRecaptcha).
 */
export async function checkRecaptchaScore(
  token: string | undefined,
  expectedAction: string,
  { passScore = 0.5, challengeScore = 0.3 }: { passScore?: number; challengeScore?: number } = {}
): Promise<RecaptchaOutcome> {
  const v = await verifyToken(token, expectedAction);
  if (v.kind === 'off' || v.kind === 'unavailable') return 'pass';
  if (v.kind === 'missing') return 'challenge';
  if (!v.ok) return 'block';
  if (v.score === undefined || v.score >= passScore) return 'pass';
  if (v.score >= challengeScore) return 'challenge';
  return 'block';
}
