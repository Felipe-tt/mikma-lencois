/**
 * Verificação server-side do reCAPTCHA v3.
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

/**
 * Verifica um token de reCAPTCHA v3 gerado no cliente.
 *
 * - Sem secret configurada (dev/CI): passa, não há o que verificar.
 * - Secret configurada e token AUSENTE: bloqueia. Antes isto passava, o que
 *   anulava o CAPTCHA: qualquer bot só precisava omitir o campo. O front
 *   sempre envia o token (ver recaptcha-client.ts); quem não consegue gerar
 *   (script bloqueado) recebe a mensagem para recarregar/desbloquear.
 * - Falha da API do Google (rede/timeout/5xx): passa (fail-open), para um
 *   soluço de terceiros não derrubar cadastro/login. O atacante não controla
 *   isso, e o rate limiting continua valendo.
 * - Resposta do Google dizendo que NÃO é humano: bloqueia.
 */
export async function verifyRecaptcha(
  token: string | undefined,
  expectedAction: string,
  minScore = 0.5
): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true; // reCAPTCHA não configurado neste ambiente
  if (!token) return false; // token ausente com reCAPTCHA configurado = bot omitindo o campo

  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return true; // erro da API do Google, não bloqueia

    const data = (await res.json()) as SiteVerifyResponse;

    if (!data.success) return false;
    if (data.action && data.action !== expectedAction) return false;
    if (typeof data.score === 'number' && data.score < minScore) return false;

    return true;
  } catch {
    return true; // timeout/rede, não bloqueia
  }
}

export type RecaptchaOutcome = 'pass' | 'challenge' | 'block';

/**
 * Versão em degraus da verificação, para fluxos que sabem lidar com um
 * meio-termo em vez de só passar/bloquear (hoje: login, via verificação
 * extra por e-mail quando o score vem "suspeito, mas não claramente bot").
 *
 * score >= passScore (0.5)      -> 'pass'      segue normal, sem fricção
 * score >= challengeScore (0.3) -> 'challenge' pede confirmação por e-mail
 * score <  challengeScore       -> 'block'     rejeita, é bot com confiança alta
 *
 * Sem secret configurada -> 'pass'. Token ausente com secret configurada ->
 * 'challenge' (não 'pass'): quem não gerou token precisa provar posse do
 * e-mail, o que cobre o usuário com script bloqueado sem deixar bot omitir
 * o campo. Erro de rede/Google -> 'pass' (fail-open, como em verifyRecaptcha).
 */
export async function checkRecaptchaScore(
  token: string | undefined,
  expectedAction: string,
  { passScore = 0.5, challengeScore = 0.3 }: { passScore?: number; challengeScore?: number } = {}
): Promise<RecaptchaOutcome> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return 'pass';
  if (!token) return 'challenge';

  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return 'pass';

    const data = (await res.json()) as SiteVerifyResponse;

    if (!data.success) return 'block';
    if (data.action && data.action !== expectedAction) return 'block';
    if (typeof data.score !== 'number') return 'pass';
    if (data.score >= passScore) return 'pass';
    if (data.score >= challengeScore) return 'challenge';
    return 'block';
  } catch {
    return 'pass';
  }
}
