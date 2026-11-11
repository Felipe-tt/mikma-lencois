/**
 * API dos Correios (contrato) simulada para os testes ponta a ponta. Confere
 * o que a loja manda como a API de verdade confere: login e código no Basic,
 * número do cartão no corpo, token no Bearer e contrato e DR na cotação.
 * Se algum faltar, responde erro e o teste pega (em produção o site cairia
 * no preço do Melhor Envio sem ninguém ver).
 */
export const CORREIOS_E2E = {
  cws: 'e2e-login:e2e-codigo-de-acesso',
  cartao: '0075520150',
  contrato: '9912490489',
  dr: 68,
  // Preço e prazo de cada serviço do contrato.
  servicos: { '03298': { preco: '21,90', prazo: 5 }, '03220': { preco: '31,27', prazo: 1 } },
  // Para este CEP de destino a API responde "fora do ar" (preço e prazo).
  cepFora: '04538133',
};

import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const TOKEN = 'e2e-token-correios';
let prePostagens = 0;
// PDF mínimo, só para o teste ver que chegou um PDF.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');
/** Cada pré-postagem recebida vai para este arquivo, para o teste conferir. */
const record = entry => { if (process.env.E2E_CORREIOS_LOG) appendFileSync(process.env.E2E_CORREIOS_LOG, JSON.stringify(entry) + '\n'); };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function correiosMock(url, init = {}) {
  const u = new URL(url);
  const auth = new Headers(init.headers).get('authorization') ?? '';

  if (u.pathname === '/token/v1/autentica/cartaopostagem') {
    const expected = `Basic ${Buffer.from(CORREIOS_E2E.cws).toString('base64')}`;
    if (auth !== expected) return json({ msgs: ['Usuário ou código de acesso inválido'] }, 401);
    const body = JSON.parse(init.body ?? '{}');
    if (body.numero !== CORREIOS_E2E.cartao) return json({ msgs: ['Cartão de postagem inválido'] }, 400);
    // Horário de Brasília sem fuso, como a API devolve.
    const exp = new Date(Date.now() + 24 * 3_600_000 - 3 * 3_600_000).toISOString().slice(0, 19);
    return json({ token: TOKEN, expiraEm: exp, cartaoPostagem: { numero: body.numero, contrato: CORREIOS_E2E.contrato, dr: CORREIOS_E2E.dr } }, 201);
  }

  if (auth !== `Bearer ${TOKEN}`) return json({ msgs: ['Token inválido'] }, 401);
  if (u.pathname.startsWith('/prepostagem/')) return prePostagemMock(u, init);
  if (u.pathname.startsWith('/srorastro/')) return rastroMock(u, init);
  const m = u.pathname.match(/^\/(preco|prazo)\/v1\/nacional\/(\d{5})$/);
  const servico = m && CORREIOS_E2E.servicos[m[2]];
  if (!servico) return json({ msgs: ['Rota ou serviço não simulado'] }, 404);
  const q = u.searchParams;
  if (!/^\d{8}$/.test(q.get('cepOrigem') ?? '') || !/^\d{8}$/.test(q.get('cepDestino') ?? '')) return json({ msgs: ['CEP inválido'] }, 400);
  if (q.get('cepDestino') === CORREIOS_E2E.cepFora) return json({ msgs: ['Serviço indisponível'] }, 503);

  if (m[1] === 'prazo') return json({ coProduto: m[2], prazoEntrega: servico.prazo });
  if (q.get('nuContrato') !== CORREIOS_E2E.contrato || q.get('nuDR') !== String(CORREIOS_E2E.dr)) return json({ msgs: ['Contrato ou DR não informado'] }, 400);
  if (!(Number(q.get('psObjeto')) > 0) || !q.get('comprimento') || !q.get('largura') || !q.get('altura')) return json({ msgs: ['Peso ou medidas faltando'] }, 400);
  return json({ coProduto: m[2], pcFinal: servico.preco });
}

/** Pré-postagem (etiqueta e coleta): confere o que a API real exige. */
function prePostagemMock(u, init) {
  const method = (init.method ?? 'GET').toUpperCase();
  const base = '/prepostagem/v1/prepostagens';
  if (method === 'POST' && u.pathname === base) {
    const b = JSON.parse(init.body ?? '{}');
    const end = e => e && /^\d{8}$/.test(e.cep ?? '') && e.logradouro && e.numero && e.bairro && e.cidade && /^[A-Z]{2}$/.test(e.uf ?? '');
    const faltando = [
      !(b.remetente?.nome?.length >= 3) && 'remetente.nome',
      !/^\d{14}$/.test(b.remetente?.cpfCnpj ?? '') && 'remetente.cpfCnpj',
      !end(b.remetente?.endereco) && 'remetente.endereco',
      !(b.destinatario?.nome?.length >= 3) && 'destinatario.nome',
      !end(b.destinatario?.endereco) && 'destinatario.endereco',
      !(b.codigoServico in CORREIOS_E2E.servicos) && 'codigoServico',
      !(Number(b.pesoInformado) > 0) && 'pesoInformado',
      b.codigoFormatoObjetoInformado !== '2' && 'codigoFormatoObjetoInformado',
      !(b.alturaInformada && b.larguraInformada && b.comprimentoInformado) && 'dimensões',
      b.cienteObjetoNaoProibido !== '1' && 'cienteObjetoNaoProibido',
      !['S', 'N'].includes(b.solicitarColeta) && 'solicitarColeta',
      !(b.itensDeclaracaoConteudo?.length && b.itensDeclaracaoConteudo.every(i => i.conteudo?.length >= 2 && Number(i.quantidade) > 0 && /^\d+\.\d{2}$/.test(i.valor))) && 'itensDeclaracaoConteudo',
    ].filter(Boolean);
    if (faltando.length) return json({ msgs: [`PPN-000: campos inválidos: ${faltando.join(', ')}`] }, 400);
    prePostagens++;
    const id = `pp_e2e_${prePostagens}`;
    const codigoObjeto = `${b.codigoServico === '03220' ? 'SX' : 'PX'}${String(1000000000 + prePostagens).slice(1)}BR`;
    record({ id, codigoObjeto, body: b });
    emitidas.add(codigoObjeto);
    return json({ id, codigoObjeto, statusAtual: 7, descStatusAtual: 'PENDENTE' });
  }
  if (method === 'POST' && u.pathname === `${base}/rotulo/assincrono/pdf`) {
    const b = JSON.parse(init.body ?? '{}');
    if (!b.idsPrePostagem?.length || !b.tipoRotulo) return json({ msgs: ['PPN-000: informe idsPrePostagem e tipoRotulo'] }, 400);
    return json({ idRecibo: `rec_${b.idsPrePostagem[0]}` });
  }
  if (method === 'GET' && u.pathname.startsWith(`${base}/rotulo/download/assincrono/rec_`)) {
    return json({ nome: 'rotulo.pdf', dados: PDF });
  }
  if (method === 'DELETE' && u.pathname.startsWith(`${base}/pp_e2e_`)) {
    record({ cancelada: u.pathname.split('/').pop() });
    return json({ resultadoCancelamento: 'Pré-postagem cancelada' });
  }
  return json({ msgs: ['Rota de pré-postagem não simulada'] }, 404);
}

/**
 * Rastreio: o teste diz em que pé está cada objeto escrevendo no arquivo
 * E2E_CORREIOS_STATE ({ "PX000000001BR": "postado" | "entregue" }). Etiqueta
 * gerada aqui e ainda não postada aparece como "Etiqueta emitida", igual à
 * API real.
 */
const emitidas = new Set();
function rastroMock(u, init) {
  if (new Headers(init.headers).get('accept-language') !== 'pt-BR') {
    return json({ msgs: ['SRO-018: Permitido apenas os valores pt-BR(Português), en(Inglês) e es-ES(Espanhol) para o idioma'] }, 400);
  }
  const file = process.env.E2E_CORREIOS_STATE;
  const state = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8') || '{}') : {};
  const ev = (codigo, tipo, descricao, horas, cidade = 'Blumenau', uf = 'SC') => ({
    codigo, tipo, descricao, dtHrCriado: new Date(Date.now() - horas * 3_600_000 - 3 * 3_600_000).toISOString().slice(0, 19), unidade: { endereco: { cidade, uf } },
  });
  const objetos = u.searchParams.getAll('codigosObjetos').map(codObjeto => {
    const eventos = [];
    if (emitidas.has(codObjeto) || state[codObjeto]) eventos.push(ev('FC', '82', 'Etiqueta emitida', 30));
    if (state[codObjeto] === 'postado' || state[codObjeto] === 'entregue') eventos.push(ev('CO', '01', 'Objeto coletado', 20), ev('RO', '01', 'Objeto em transferência - por favor aguarde', 10, 'Indaial'));
    if (state[codObjeto] === 'entregue') eventos.push(ev('BDE', '01', 'Objeto entregue ao destinatário', 1, 'São Paulo', 'SP'));
    // Previsão: daqui a 3 dias, no fim do dia (como a API real manda).
    const prevista = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) + 'T23:59:59';
    return eventos.length
      ? { codObjeto, tipoPostal: {}, ...(state[codObjeto] ? { dtPrevista: prevista } : {}), eventos: eventos.reverse() }
      : { codObjeto, mensagem: 'SRO-020: Objeto não encontrado na base de dados dos Correios.' };
  });
  return json({ versao: '3.9.0', quantidade: objetos.length, objetos, tipoResultado: 'Lista de Objetos' });
}
