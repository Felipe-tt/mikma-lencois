/**
 * Carregado no servidor Next dos testes (NODE_OPTIONS=--import): desvia as
 * chamadas externas para simuladores locais. A AbacatePay vai para o
 * simulador (e2e/mocks/abacatepay-server.mjs); Uber e roteamento respondem
 * vazio, para o teste não depender de serviço de terceiros.
 */
const original = globalThis.fetch;
const ABACATE = process.env.E2E_ABACATEPAY_URL || 'http://127.0.0.1:4010';

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('https://api.abacatepay.com/')) {
    return original(url.replace('https://api.abacatepay.com', ABACATE), init);
  }
  if (/^https:\/\/(auth\.uber\.com|sandbox-api\.uber\.com|api\.uber\.com|routing\.openstreetmap\.de)\//.test(url)) {
    return new Response(JSON.stringify({ error: 'indisponível nos testes' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
  return original(input, init);
};
