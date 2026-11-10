/**
 * API dos Correios (contrato) simulada para os testes ponta a ponta. Confere
 * o que a loja manda como a API de verdade confere: login e código no Basic,
 * número do cartão no corpo, token no Bearer e contrato e DR na cotação.
 * Se algum faltar, responde erro e o teste pega (o site cairia no preço de
 * reserva sem ninguém ver).
 */
export const CORREIOS_E2E = {
  cws: 'e2e-login:e2e-codigo-de-acesso',
  cartao: '0075520150',
  contrato: '9912490489',
  dr: 68,
  // Preço e prazo de cada serviço do contrato.
  servicos: { '03298': { preco: '21,90', prazo: 5 }, '03220': { preco: '31,27', prazo: 1 } },
};

const TOKEN = 'e2e-token-correios';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function correiosMock(url, init = {}) {
  const u = new URL(url);
  const auth = new Headers(init.headers).get('authorization') ?? '';

  if (u.pathname === '/token/v1/autentica/cartaopostagem') {
    const expected = `Basic ${Buffer.from(CORREIOS_E2E.cws).toString('base64')}`;
    if (auth !== expected) return json({ msgs: ['Usuário ou código de acesso inválido'] }, 401);
    const body = JSON.parse(init.body ?? '{}');
    if (body.numero !== CORREIOS_E2E.cartao) return json({ msgs: ['Cartão de postagem inválido'] }, 400);
    const exp = new Date(Date.now() + 24 * 3_600_000 - 3 * 3_600_000).toISOString().slice(0, 19);
    return json({ token: TOKEN, expiraEm: exp, cartaoPostagem: { numero: body.numero, contrato: CORREIOS_E2E.contrato, dr: CORREIOS_E2E.dr } }, 201);
  }

  if (auth !== `Bearer ${TOKEN}`) return json({ msgs: ['Token inválido'] }, 401);
  const m = u.pathname.match(/^\/(preco|prazo)\/v1\/nacional\/(\d{5})$/);
  const servico = m && CORREIOS_E2E.servicos[m[2]];
  if (!servico) return json({ msgs: ['Rota ou serviço não simulado'] }, 404);
  const q = u.searchParams;
  if (!/^\d{8}$/.test(q.get('cepOrigem') ?? '') || !/^\d{8}$/.test(q.get('cepDestino') ?? '')) return json({ msgs: ['CEP inválido'] }, 400);

  if (m[1] === 'prazo') return json({ coProduto: m[2], prazoEntrega: servico.prazo });
  if (q.get('nuContrato') !== CORREIOS_E2E.contrato || q.get('nuDR') !== String(CORREIOS_E2E.dr)) return json({ msgs: ['Contrato ou DR não informado'] }, 400);
  if (!(Number(q.get('psObjeto')) > 0) || !q.get('comprimento') || !q.get('largura') || !q.get('altura')) return json({ msgs: ['Peso ou medidas faltando'] }, 400);
  return json({ coProduto: m[2], pcFinal: servico.preco });
}
