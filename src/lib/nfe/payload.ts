import { isValidCpf, isValidCep } from '@/lib/masks';
import type { NfeConfig } from './config';

/**
 * Montagem da NF-e (modelo 55) de um pedido no formato JSON da Focus NFe.
 * Função pura: recebe o pedido, o cliente e a configuração e devolve o
 * corpo da requisição, ou lança NfeDataError com tudo o que falta.
 *
 * Valores: o desconto (PIX + cupom), o frete e o acréscimo do parcelamento
 * no cartão são rateados entre os itens, ao centavo, de forma que a soma da
 * nota bata exatamente com o total cobrado do cliente.
 */

export class NfeDataError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Dados insuficientes para a nota: ${problems.join('; ')}`);
  }
}

export interface NfeOrderItem {
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number; // centavos
  note?: string;
  variant?: { size?: string; colorName?: string; color?: string };
}

export interface NfeOrder {
  id: string;
  items: NfeOrderItem[];
  productsCents?: number;
  shippingCents?: number;
  discountCents?: number;
  pixDiscountCents?: number;
  couponDiscountCents?: number;
  totalCents: number;
  address?: { cep?: string; street?: string; number?: string; complement?: string; neighborhood?: string; city?: string; state?: string };
  payment?: { method?: string };
  delivery?: { carrier?: string };
}

export interface NfeCustomer {
  name: string;
  cpf: string;
  email?: string;
  phone?: string;
}

// Exigência da SEFAZ: em homologação o nome do destinatário é este texto.
export const HOMOLOGACAO_DEST_NAME = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

const reais = (cents: number) => (cents / 100).toFixed(2);
const digits = (v: string | undefined) => (v ?? '').replace(/\D/g, '');
// A SEFAZ recusa quebras de linha e caracteres de controle nos campos de texto.
const clean = (v: string | undefined, max: number) => (v ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Reparte `total` centavos entre pesos, proporcionalmente, sem perder
 * centavo (maior resto). Peso 0 recebe 0.
 */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map(w => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % order.length) {
    if (weights[order[k].i] > 0) { out[order[k].i]++; rest--; }
  }
  return out;
}

/** Data/hora no fuso de Brasília no formato que a SEFAZ aceita (com -03:00). */
export function brasiliaIso(date: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce<Record<string, string>>((acc, x) => { acc[x.type] = x.value; return acc; }, {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`;
}

export function buildNfePayload(
  order: NfeOrder,
  customer: NfeCustomer,
  config: NfeConfig,
  opts: { homologacao: boolean; now?: Date },
): Record<string, unknown> {
  const problems: string[] = [];
  const addr = order.address ?? {};
  const uf = (addr.state ?? '').trim().toUpperCase();
  const cpf = digits(customer.cpf);

  if (!isValidCpf(cpf)) problems.push('CPF do cliente ausente ou inválido');
  if (!clean(customer.name, 60) && !opts.homologacao) problems.push('nome do cliente');
  if (!isValidCep(addr.cep ?? '')) problems.push('CEP do endereço');
  if (!clean(addr.street, 60)) problems.push('rua do endereço');
  if (!clean(addr.number, 60)) problems.push('número do endereço');
  if (!clean(addr.neighborhood, 60)) problems.push('bairro do endereço');
  if (!clean(addr.city, 60)) problems.push('cidade do endereço');
  if (!UFS.has(uf)) problems.push('UF do endereço');
  if (!UFS.has(config.ufEmitente)) problems.push('UF do emitente nas configurações');
  if (digits(config.cnpj).length !== 14) problems.push('CNPJ do emitente nas configurações');
  if (!/^\d{8}$/.test(config.ncm)) problems.push('NCM nas configurações (8 dígitos)');
  const items = (order.items ?? []).filter(i => i.quantity > 0);
  if (items.length === 0) problems.push('pedido sem itens');
  if (items.some(i => !Number.isInteger(i.unitPrice) || i.unitPrice <= 0 || !Number.isInteger(i.quantity))) problems.push('item com preço ou quantidade inválidos');

  // Valores do pedido, em centavos.
  const gross = items.map(i => i.unitPrice * i.quantity);
  const productsCents = gross.reduce((a, b) => a + b, 0);
  const shippingCents = Math.max(0, order.shippingCents ?? 0);
  const discountCents = Math.max(0, order.discountCents ?? ((order.pixDiscountCents ?? 0) + (order.couponDiscountCents ?? 0)));
  // O que o cliente pagou além de produtos − descontos + frete: o acréscimo
  // do parcelamento no cartão. Entra como "outras despesas acessórias".
  const otherCents = order.totalCents - (productsCents - discountCents + shippingCents);
  if (typeof order.productsCents === 'number' && order.productsCents !== productsCents) problems.push('soma dos itens diferente do valor de produtos do pedido');
  if (discountCents > productsCents) problems.push('desconto maior que o valor dos produtos');
  if (otherCents < 0) problems.push('total do pedido menor que produtos − desconto + frete');

  if (problems.length > 0) throw new NfeDataError(problems);

  const discounts = apportion(discountCents, gross);
  const freights = apportion(shippingCents, gross);
  const others = apportion(otherCents, gross);
  const interestadual = uf !== config.ufEmitente;
  const cfop = interestadual ? config.cfopInterestadual : config.cfopInterno;

  const itens = items.map((item, i) => {
    const variant = [item.variant?.size, item.variant?.colorName ?? item.variant?.color].filter(Boolean).join(' ');
    const descricao = clean(variant && !item.productName.toLowerCase().includes(variant.toLowerCase()) ? `${item.productName} ${variant}` : item.productName, 120);
    return {
      numero_item: i + 1,
      codigo_produto: clean(item.sku, 60),
      descricao,
      cfop,
      codigo_ncm: config.ncm,
      unidade_comercial: 'UN',
      quantidade_comercial: item.quantity,
      valor_unitario_comercial: reais(item.unitPrice),
      unidade_tributavel: 'UN',
      quantidade_tributavel: item.quantity,
      valor_unitario_tributavel: reais(item.unitPrice),
      valor_bruto: reais(gross[i]),
      ...(discounts[i] > 0 ? { valor_desconto: reais(discounts[i]) } : {}),
      ...(freights[i] > 0 ? { valor_frete: reais(freights[i]) } : {}),
      ...(others[i] > 0 ? { valor_outras_despesas: reais(others[i]) } : {}),
      inclui_no_total: 1,
      icms_origem: config.origem,
      icms_situacao_tributaria: config.csosn,
      pis_situacao_tributaria: config.pisCofinsCst,
      cofins_situacao_tributaria: config.pisCofinsCst,
      ...(item.note ? { informacoes_adicionais_item: clean(item.note, 500) } : {}),
    };
  });

  const pickup = order.delivery?.carrier === 'pickup';
  const isPix = order.payment?.method === 'pix';
  const now = opts.now ?? new Date();

  return {
    natureza_operacao: clean(config.naturezaOperacao, 60),
    data_emissao: brasiliaIso(now),
    data_entrada_saida: brasiliaIso(now),
    tipo_documento: 1, // saída
    finalidade_emissao: 1, // normal
    local_destino: interestadual ? 2 : 1,
    consumidor_final: 1,
    presenca_comprador: 2, // internet
    indicador_intermediario: 0, // site próprio, sem marketplace
    cnpj_emitente: digits(config.cnpj),
    nome_destinatario: opts.homologacao ? HOMOLOGACAO_DEST_NAME : clean(customer.name, 60),
    cpf_destinatario: cpf,
    indicador_inscricao_estadual_destinatario: 9, // não contribuinte
    ...(customer.email ? { email_destinatario: clean(customer.email, 60) } : {}),
    ...(digits(customer.phone).length >= 10 ? { telefone_destinatario: digits(customer.phone).slice(0, 14) } : {}),
    logradouro_destinatario: clean(addr.street, 60),
    numero_destinatario: clean(addr.number, 60),
    ...(clean(addr.complement, 60) ? { complemento_destinatario: clean(addr.complement, 60) } : {}),
    bairro_destinatario: clean(addr.neighborhood, 60),
    municipio_destinatario: clean(addr.city, 60),
    uf_destinatario: uf,
    cep_destinatario: digits(addr.cep),
    pais_destinatario: 'Brasil',
    // Retirada na loja: sem frete. Entrega: contratada pela loja (CIF).
    modalidade_frete: pickup ? 9 : 0,
    valor_produtos: reais(productsCents),
    ...(shippingCents > 0 ? { valor_frete: reais(shippingCents) } : {}),
    ...(discountCents > 0 ? { valor_desconto: reais(discountCents) } : {}),
    ...(otherCents > 0 ? { valor_outras_despesas: reais(otherCents) } : {}),
    valor_total: reais(order.totalCents),
    items: itens,
    formas_pagamento: [{
      // 17 = PIX dinâmico; 03 = cartão de crédito. Pagamento não integrado
      // à automação (feito pela AbacatePay).
      forma_pagamento: isPix ? '17' : '03',
      valor_pagamento: reais(order.totalCents),
      tipo_integracao: 2,
    }],
    informacoes_adicionais_contribuinte: clean(`${config.infoAdicional} Pedido ${order.id.slice(-8).toUpperCase()}.`, 2000),
  };
}
