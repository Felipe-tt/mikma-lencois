/**
 * Etiqueta e coleta pelo contrato dos Correios, direto da Mikma (API de
 * pré-postagem, api.correios.com.br/prepostagem). A pré-postagem gera o
 * código de rastreio; com `solicitarColeta: 'S'` os Correios agendam a coleta
 * no endereço do remetente (a loja). Nada é cobrado até o objeto ser postado;
 * a pré-postagem não postada expira sozinha em 14 dias.
 *
 * Fluxo testado no contrato real: criar (200 com `id` e `codigoObjeto`),
 * pedir o rótulo (200 com `idRecibo`), baixar (`{ nome, dados }`, PDF em
 * base64) e cancelar (`resultadoCancelamento`).
 */
import { correiosBearer, dropCorreiosToken } from '@/lib/correiosContrato';
import { packageFor } from '@/lib/shipping-pricing';
import type { Address, Order } from '@/types';
import type { StoreSettings } from '@/lib/store-settings';

const API = 'https://api.correios.com.br/prepostagem/v1/prepostagens';

export const SERVICO_CORREIOS: Record<string, string> = { correios_pac: '03298', correios_sedex: '03220' };

export interface Remetente {
  nome: string;
  cnpj: string;
  telefone?: string;
  email?: string;
  endereco: Address;
}

export interface PrePostagemInfo {
  id: string;
  codigoObjeto: string;
  coleta: boolean;
  createdAt: string;
}

export class CorreiosError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
export const cut = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

/** Celular (11 dígitos) ou telefone fixo (10) no formato da API: DDD separado. */
export function phoneFields(raw: string | undefined) {
  const d = digits(raw).replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return { dddCelular: d.slice(0, 2), celular: d.slice(2) };
  if (d.length === 10) return { dddTelefone: d.slice(0, 2), telefone: d.slice(2) };
  return {};
}

export function endereco(a: Address) {
  return {
    cep: digits(a.cep),
    logradouro: cut(a.street, 50),
    numero: cut(a.number, 6) || 'S/N',
    ...(a.complement ? { complemento: cut(a.complement, 30) } : {}),
    bairro: cut(a.neighborhood, 30),
    cidade: cut(a.city, 30),
    uf: cut(a.state, 2).toUpperCase(),
  };
}

/** O que falta para gerar a etiqueta (vazio = pode gerar). */
/** Dados da loja (remetente e endereço da coleta) a partir das Configurações. */
export function remetenteFrom(s: StoreSettings): Remetente {
  return {
    nome: s.nfeRazaoSocial || s.storeName,
    cnpj: s.nfeCnpj || s.storeCnpj,
    telefone: s.storePhone,
    email: s.storeEmail,
    endereco: {
      cep: s.storeCep || s.originCep, street: s.storeAddress, number: s.storeNumber, complement: s.storeComplement,
      neighborhood: s.storeNeighborhood, city: s.storeCity, state: s.storeState,
    },
  };
}

/** O que falta nas Configurações para gerar etiqueta (vazio = tudo certo). */
export function remetenteProblems(remetente: Remetente): string[] {
  const problems: string[] = [];
  const r = remetente.endereco;
  if (cut(remetente.nome, 50).length < 3) problems.push('Falta o nome da loja (Configurações > Loja).');
  if (digits(remetente.cnpj).length !== 14) problems.push('Falta o CNPJ da loja (Configurações > Loja).');
  if (digits(r.cep).length !== 8 || !r.street || !r.neighborhood || !r.city || !r.state) problems.push('Falta o endereço completo da loja (Configurações > Loja): é dele que os Correios coletam.');
  return problems;
}

export function prePostagemProblems(order: Pick<Order, 'delivery' | 'address' | 'customerName' | 'items'>, remetente: Remetente): string[] {
  const problems: string[] = [];
  if (!SERVICO_CORREIOS[order.delivery?.carrier ?? '']) problems.push('Este pedido não é por PAC ou SEDEX.');
  problems.push(...remetenteProblems(remetente));
  const a = order.address;
  if (!a || digits(a.cep).length !== 8 || !a.street || !a.neighborhood || !a.city || !a.state) problems.push('O endereço de entrega do pedido está incompleto.');
  if (cut(order.customerName, 50).length < 3) problems.push('Falta o nome do cliente no pedido.');
  if (!order.items?.length) problems.push('O pedido não tem itens.');
  return problems;
}

/**
 * Corpo da pré-postagem. A declaração de conteúdo é obrigatória (mesmo com
 * NF-e): vai cada item do pedido com quantidade e valor unitário.
 */
export function buildPrePostagem(
  order: Pick<Order, 'id' | 'delivery' | 'address' | 'customerName' | 'customerEmail' | 'items' | 'nfe'>,
  remetente: Remetente,
  opts: { weightKg: number; coleta: boolean },
) {
  const pkg = packageFor(opts.weightKg);
  const chave = digits(order.nfe?.status === 'autorizada' ? order.nfe.chave : '');
  // Itens iguais (mesmo nome) somam: a declaração aceita um por tipo.
  const itens = new Map<string, { quantidade: number; valor: number }>();
  for (const i of order.items) {
    const nome = cut(i.productName, 60).padEnd(2, '.');
    const prev = itens.get(nome);
    itens.set(nome, { quantidade: (prev?.quantidade ?? 0) + i.quantity, valor: i.unitPrice });
  }
  return {
    remetente: {
      nome: cut(remetente.nome, 50),
      cpfCnpj: digits(remetente.cnpj),
      ...phoneFields(remetente.telefone),
      ...(remetente.email ? { email: cut(remetente.email, 255) } : {}),
      endereco: endereco(remetente.endereco),
    },
    destinatario: {
      nome: cut(order.customerName, 50),
      ...(order.customerEmail ? { email: cut(order.customerEmail, 255) } : {}),
      endereco: { ...endereco(order.address), regiao: '' },
    },
    codigoServico: SERVICO_CORREIOS[order.delivery.carrier ?? ''],
    pesoInformado: String(Math.max(300, Math.round(opts.weightKg * 1000))),
    codigoFormatoObjetoInformado: '2',
    comprimentoInformado: String(pkg.lengthCm),
    larguraInformada: String(pkg.widthCm),
    alturaInformada: String(pkg.heightCm),
    cienteObjetoNaoProibido: '1',
    solicitarColeta: opts.coleta ? 'S' : 'N',
    itensDeclaracaoConteudo: [...itens].map(([conteudo, v]) => ({ conteudo, quantidade: String(v.quantidade), valor: (v.valor / 100).toFixed(2) })),
    ...(chave.length === 44 ? { chaveNFe: chave } : {}),
    observacao: cut(`Pedido ${order.id.replace(/^ord_/, '').slice(0, 8).toUpperCase()}`, 50),
    pedidoExternoOrigem: cut(order.id, 25),
  };
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await correiosBearer();
    if (!token) throw new CorreiosError('Contrato dos Correios indisponível (credencial ou cartão de postagem).', 503);
    const res = await fetch(API + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401 && attempt === 0) { dropCorreiosToken(); continue; }
    return res;
  }
  throw new CorreiosError('Os Correios recusaram a credencial.', 502);
}

/** Mensagem dos Correios (`msgs`) para mostrar no painel. */
async function correiosMessage(res: Response): Promise<string> {
  // Os Correios mandam o motivo em `msgs`, `msg` ou `mensagem`, conforme a rota.
  const body = await res.json().catch(() => ({})) as { msgs?: string[]; msg?: string; mensagem?: string };
  const msg = (body.msgs ?? []).join(' ') || body.msg || body.mensagem || `HTTP ${res.status}`;
  return `Os Correios recusaram: ${msg}`.slice(0, 400);
}

export async function createPrePostagem(body: ReturnType<typeof buildPrePostagem> | Record<string, unknown>): Promise<{ id: string; codigoObjeto: string }> {
  const res = await call('', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new CorreiosError(await correiosMessage(res), res.status >= 500 ? 502 : 400);
  const d = await res.json() as { id?: string; codigoObjeto?: string };
  if (!d.id || !d.codigoObjeto) throw new CorreiosError('Os Correios não devolveram o código de rastreio.');
  return { id: String(d.id), codigoObjeto: String(d.codigoObjeto) };
}

/**
 * PDF das etiquetas (uma ou várias, num arquivo só): pede o rótulo e baixa pelo recibo. A geração é assíncrona;
 * enquanto não fica pronta, o download responde com aviso (PPN-291) e tenta
 * de novo. Pré-postagem ainda pendente (PPN-288) pede um recibo novo.
 */
export async function labelPdf(ids: string | string[], opts: { tries?: number; waitMs?: number } = {}): Promise<Buffer> {
  const idsPrePostagem = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (!idsPrePostagem.length) throw new CorreiosError('Nenhuma etiqueta para imprimir.', 400);
  const tries = opts.tries ?? 10;
  const waitMs = opts.waitMs ?? 2000;
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  let recibo = '';
  for (let i = 0; i < tries; i++) {
    if (!recibo) {
      const req = await call('/rotulo/assincrono/pdf', {
        method: 'POST',
        body: JSON.stringify({ idsPrePostagem, tipoRotulo: 'P', formatoRotulo: 'ET', imprimeRemetente: 'S', layoutImpressao: 'PADRAO' }),
      });
      if (!req.ok) throw new CorreiosError(await correiosMessage(req), req.status >= 500 ? 502 : 400);
      recibo = String((await req.json() as { idRecibo?: string }).idRecibo ?? '');
      if (!recibo) throw new CorreiosError('Os Correios não devolveram o recibo da etiqueta.');
    }
    await sleep(i === 0 ? Math.min(waitMs, 1000) : waitMs);
    const res = await call(`/rotulo/download/assincrono/${encodeURIComponent(recibo)}`);
    if (!res.ok) throw new CorreiosError(await correiosMessage(res), res.status >= 500 ? 502 : 400);
    if ((res.headers.get('content-type') ?? '').includes('pdf')) return Buffer.from(await res.arrayBuffer());
    const d = await res.json().catch(() => ({})) as { dados?: string; mensagem?: string };
    if (d.dados) return Buffer.from(d.dados, 'base64');
    if (d.mensagem?.includes('PPN-288')) recibo = '';
  }
  throw new CorreiosError('A etiqueta ainda não ficou pronta nos Correios. Tente de novo em alguns segundos.', 504);
}

export async function cancelPrePostagem(id: string): Promise<void> {
  const res = await call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.ok) return;
  const msg = await correiosMessage(res);
  // Já cancelada nos Correios: para a loja, dá no mesmo.
  if (/PPN-145/.test(msg)) return;
  throw new CorreiosError(msg, res.status >= 500 ? 502 : 400);
}
