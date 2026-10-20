/**
 * Utilidades de IP sem dependências (seguras para o Edge Runtime do proxy).
 */

/** IPv4 ou IPv6 sintaticamente plausível (sem lixo arbitrário como chave de rate limit). */
export function isPlausibleIp(value: string): boolean {
  if (value.length > 45) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value.split('.').every((n) => Number(n) <= 255);
  }
  return value.includes(':') && /^[0-9a-f:.]+$/i.test(value);
}

/** Header que a Cloudflare injeta (Transform Rule) com o segredo compartilhado. */
export const EDGE_HEADER = 'x-mikma-edge';

type Headers = { get(name: string): string | null };

/** true se a requisição passou pela Cloudflare (header com o segredo certo). */
export function cameThroughEdge(headers: Headers, secret = process.env.EDGE_SHARED_SECRET): boolean {
  if (!secret) return false;
  const got = headers.get(EDGE_HEADER);
  if (!got || got.length !== secret.length) return false;
  // Comparação em tempo constante (sem depender de node:crypto no Edge).
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= got.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

/**
 * IP do visitante, só de fontes que o visitante não consegue forjar:
 * 1. cf-connecting-ip, quando a requisição veio da Cloudflare (provado pelo
 *    segredo em x-mikma-edge; sem ele o header seria forjável);
 * 2. x-fah-client-ip, que o Firebase App Hosting define com o IP de quem
 *    conectou (atrás da Cloudflare, é o IP dela, por isso vem depois);
 * 3. último x-forwarded-for, só para ambiente local/emulador.
 * O antigo fastly-client-ip saiu: ele era da hospedagem clássica (Fastly);
 * no App Hosting ninguém o define, então qualquer um podia mandar um IP
 * diferente a cada requisição e escapar de todos os limites por IP.
 */
export function clientIpFromHeaders(headers: Headers): string {
  if (cameThroughEdge(headers)) {
    const cf = headers.get('cf-connecting-ip')?.trim();
    if (cf && isPlausibleIp(cf)) return cf;
  }

  const fah = headers.get('x-fah-client-ip')?.trim();
  if (fah && isPlausibleIp(fah)) return fah;

  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    const parts = fwd.split(',').map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && isPlausibleIp(last)) return last;
  }
  const real = headers.get('x-real-ip')?.trim();
  return real && isPlausibleIp(real) ? real : 'unknown';
}
