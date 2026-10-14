/**
 * Checagens de e-mail que so fazem sentido no servidor (DNS, lista de
 * descartaveis e verificador externo opcional). Todas "falham aberto":
 * se o DNS ou a API externa estiver fora, o cadastro nao e bloqueado,
 * porque o link de confirmacao enviado por e-mail e a prova definitiva
 * de que a caixa existe.
 */
import { promises as dns } from 'node:dns';
import MailChecker from 'mailchecker';

export type DeliverabilityResult = { ok: true } | { ok: false; error: string };

const DNS_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const mxCache = new Map<string, { ok: boolean; at: number }>();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms)),
  ]);
}

/** true = dominio recebe e-mail (MX, ou A/AAAA como fallback do RFC 5321); false = nao existe/sem destino. */
async function domainAcceptsMail(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.ok;

  let result = true; // falha aberto
  try {
    const mx = await withTimeout(dns.resolveMx(domain), DNS_TIMEOUT_MS);
    // "Null MX" (RFC 7505): exchange "." significa que o dominio nao recebe e-mail
    result = mx.some(r => r.exchange && r.exchange !== '.');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      try {
        const [a, aaaa] = await Promise.all([
          withTimeout(dns.resolve4(domain), DNS_TIMEOUT_MS).catch(() => []),
          withTimeout(dns.resolve6(domain), DNS_TIMEOUT_MS).catch(() => []),
        ]);
        result = a.length + aaaa.length > 0;
      } catch {
        result = false;
      }
    } // timeout/SERVFAIL: mantem true
  }
  if (mxCache.size >= CACHE_MAX) mxCache.delete(mxCache.keys().next().value as string);
  mxCache.set(domain, { ok: result, at: Date.now() });
  return result;
}

/**
 * Verificador de caixa postal em tempo real (SMTP) via Kickbox. So roda se
 * KICKBOX_API_KEY estiver definida. Rejeita apenas "undeliverable"; "risky"
 * e "unknown" (catch-all, Gmail/Microsoft bloqueando sondagem) passam.
 */
async function kickboxRejects(email: string): Promise<boolean> {
  const key = process.env.KICKBOX_API_KEY;
  if (!key) return false;
  try {
    const url = `https://api.kickbox.com/v2/verify?email=${encodeURIComponent(email)}&timeout=4000&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean; result?: string };
    return data.success === true && data.result === 'undeliverable';
  } catch {
    return false;
  }
}

export async function checkEmailDeliverability(email: string): Promise<DeliverabilityResult> {
  const domain = email.split('@')[1];
  if (!domain) return { ok: false, error: 'Informe um e-mail válido.' };

  if (!MailChecker.isValid(email)) {
    return { ok: false, error: 'E-mails temporários não são aceitos. Use seu e-mail de uso pessoal.' };
  }
  if (!(await domainAcceptsMail(domain))) {
    return { ok: false, error: 'Esse domínio de e-mail não existe ou não recebe mensagens. Confira se digitou certo.' };
  }
  if (await kickboxRejects(email)) {
    return { ok: false, error: 'Não encontramos essa caixa de e-mail. Confira se digitou certo.' };
  }
  return { ok: true };
}
