import { describe, expect, it } from 'vitest';
import { cspReportUrl } from './cspReport';

describe('cspReportUrl', () => {
  it('monta o endereço de segurança do Sentry a partir do DSN', () => {
    expect(cspReportUrl('https://abc123@o45.ingest.us.sentry.io/789'))
      .toBe('https://o45.ingest.us.sentry.io/api/789/security/?sentry_key=abc123&sentry_environment=production');
  });
  it('sem DSN ou DSN inválido, não há relatório', () => {
    expect(cspReportUrl(undefined)).toBeNull();
    expect(cspReportUrl('')).toBeNull();
    expect(cspReportUrl('nada')).toBeNull();
    expect(cspReportUrl('https://o45.ingest.sentry.io/789')).toBeNull();
    expect(cspReportUrl('https://k@o45.ingest.sentry.io/abc')).toBeNull();
  });
});
