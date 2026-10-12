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

/**
 * IP do visitante a partir dos headers. Mesma ordem usada pelas rotas de API:
 * fastly-client-ip (só se for um IP válido) > último x-forwarded-for > x-real-ip.
 * Atenção: fastly-client-ip só é confiável se a requisição passou pelo Firebase
 * Hosting/Fastly; por isso nada crítico deve depender apenas do IP.
 */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string {
  const fastly = headers.get('fastly-client-ip')?.trim();
  if (fastly && isPlausibleIp(fastly)) return fastly;

  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    const parts = fwd.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return headers.get('x-real-ip') ?? headers.get('x-nf-client-connection-ip') ?? 'unknown';
}
