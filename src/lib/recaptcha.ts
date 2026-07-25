/**
 * Verificação server-side do reCAPTCHA v3.
 *
 * Antes desta correção, o campo `recaptchaToken` era aceito como opcional
 * no schema de /api/auth/register mas NUNCA verificado contra a API do
 * Google — nem sequer era gerado no frontend. Na prática não havia CAPTCHA
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
 * Fail-open por design (mesmo padrão já usado no projeto para Sentry e
 * Upstash): se a secret não estiver configurada, ou se a chamada ao Google
 * falhar/der timeout, a verificação passa — um soluço de rede ou uma env
 * var não configurada em algum ambiente não deve travar cadastro/login
 * para usuários legítimos. A proteção real contra automação em massa
 * continua sendo o rate limiting, que não depende de terceiros.
 */
export async function verifyRecaptcha(
  token: string | undefined,
  expectedAction: string,
  minScore = 0.5
): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true; // reCAPTCHA não configurado neste ambiente
  if (!token) return true;  // frontend não enviou token (ex: JS desabilitado) — não bloqueia

  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return true; // erro da API do Google — não bloqueia

    const data = (await res.json()) as SiteVerifyResponse;

    if (!data.success) return false;
    if (data.action && data.action !== expectedAction) return false;
    if (typeof data.score === 'number' && data.score < minScore) return false;

    return true;
  } catch {
    return true; // timeout/rede — não bloqueia
  }
}
