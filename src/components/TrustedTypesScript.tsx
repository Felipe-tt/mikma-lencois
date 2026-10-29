import { SCRIPT_ORIGINS } from '@/lib/scriptOrigins';

/**
 * Política "default" de Trusted Types (a CSP exige com
 * require-trusted-types-for 'script'). Todo script que o site ou uma
 * biblioteca tentar carregar passa por aqui: só vale o próprio site, blob:
 * (workers) e as origens do script-src. Um script injetado de outro domínio
 * é recusado pelo navegador e vira relatório no Sentry. HTML e script inline
 * passam como antes (a CSP e o React já cuidam deles).
 *
 * Precisa ser o primeiro script do <head>: roda antes de qualquer outro.
 */
export function TrustedTypesScript() {
  const script = `(function(){
  var tt = window.trustedTypes;
  if (!tt || !tt.createPolicy) return;
  var ok = ${JSON.stringify(SCRIPT_ORIGINS)};
  try {
    tt.createPolicy('default', {
      createHTML: function (s) { return s; },
      createScript: function (s) { return s; },
      createScriptURL: function (s) {
        var u = new URL(s, location.href);
        var checkout = location.pathname === '/checkout' || location.pathname.indexOf('/checkout/') === 0;
        if (u.origin === location.origin || u.protocol === 'blob:' || ok.indexOf(u.origin) !== -1 || (checkout && u.protocol === 'https:')) return s;
        throw new TypeError('Script bloqueado pela política do site: ' + u.origin);
      }
    });
  } catch (e) {}
})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
