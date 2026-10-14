/**
 * Checagens de e-mail que so fazem sentido no servidor, todas gratuitas:
 * lista de descartaveis (biblioteca local) e consulta DNS de MX.
 * Falham abertas: se o DNS estiver fora, o cadastro nao e bloqueado, porque o
 * link de confirmacao enviado por e-mail e a prova definitiva de que a caixa existe.
 *
 * Nao ha verificacao de caixa postal (sondagem SMTP ou API de terceiros): nao
 * existe opcao gratuita e confiavel. Sondagem SMTP exige porta 25 de saida
 * (bloqueada na Google Cloud) e Gmail/Microsoft/catch-all dao falsos
 * resultados; APIs de verificacao sao pagas e enviam e-mails de clientes a terceiros.
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

export async function checkEmailDeliverability(email: string): Promise<DeliverabilityResult> {
  const domain = email.split('@')[1];
  if (!domain) return { ok: false, error: 'Informe um e-mail válido.' };

  if (!MailChecker.isValid(email)) {
    return { ok: false, error: 'E-mails temporários não são aceitos. Use seu e-mail de uso pessoal.' };
  }
  if (!(await domainAcceptsMail(domain))) {
    return { ok: false, error: 'Esse domínio de e-mail não existe ou não recebe mensagens. Confira se digitou certo.' };
  }
  return { ok: true };
}
