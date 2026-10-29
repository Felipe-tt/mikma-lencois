/**
 * Endereço de relatórios de segurança do Sentry a partir do DSN: o navegador
 * manda para lá cada bloqueio da CSP (script estranho, Trusted Types). Sem
 * DSN (dev, testes), não há relatório.
 * DSN: https://<chave>@<host>/<projeto> → https://<host>/api/<projeto>/security/?sentry_key=<chave>
 */
export function cspReportUrl(dsn: string | undefined, environment = 'production'): string | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!u.username || !/^\d+$/.test(project)) return null;
    const q = new URLSearchParams({ sentry_key: u.username, sentry_environment: environment });
    return `https://${u.host}/api/${project}/security/?${q}`;
  } catch {
    return null;
  }
}
