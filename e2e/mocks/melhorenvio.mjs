/**
 * Melhor Envio simulado para os testes ponta a ponta: só a cotação, que é o
 * que a loja usa. Preços diferentes dos do contrato dos Correios, para o
 * teste saber de onde veio cada frete.
 */
export const MELHOR_ENVIO_E2E = {
  token: 'e2e_melhor_envio_token',
  servicos: [
    { id: 1, name: 'PAC', price: '27.50', custom_price: '27.50', delivery_time: 7, custom_delivery_time: 7 },
    { id: 2, name: 'SEDEX', price: '41.80', custom_price: '41.80', delivery_time: 3, custom_delivery_time: 3 },
    { id: 7, name: '.Package', price: '29.90', custom_price: '29.90', delivery_time: 6, custom_delivery_time: 6 },
    { id: 18, name: '.Com', error: 'Serviço indisponível para o trecho' },
  ],
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function melhorEnvioMock(url, init = {}) {
  const u = new URL(url);
  if (u.pathname !== '/api/v2/me/shipment/calculate') return json({ message: 'Rota não simulada' }, 404);
  if (new Headers(init.headers).get('authorization') !== `Bearer ${MELHOR_ENVIO_E2E.token}`) return json({ message: 'Unauthenticated.' }, 401);
  const body = JSON.parse(init.body ?? '{}');
  const cep = v => /^\d{8}$/.test(String(v ?? ''));
  if (!cep(body.from?.postal_code) || !cep(body.to?.postal_code) || !(body.package?.weight > 0)) return json({ message: 'Dados inválidos' }, 422);
  return json(MELHOR_ENVIO_E2E.servicos);
}
