import { isValidCpf, isValidCep } from '@/lib/masks';
import type { NfeConfig } from './config';

/**
 * Montagem da NF-e (modelo 55, leiaute 4.00) de um pedido, no formato de
 * objeto da biblioteca nfewizard-io (mesmos nomes das tags do XML). Funções
 * puras: validam, calculam e montam; quem envia é o sefaz.ts.
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

/** Dados da nota que precisam ser os mesmos em toda nova tentativa (a chave depende deles). */
export interface NfeIdentity {
  numero: number;
  serie: number;
  cNF: string; // código numérico aleatório de 8 dígitos
  dhEmi: string; // ISO com -03:00
  homologacao: boolean;
  cMunDest: string; // IBGE do município do cliente
}

// Exigência da SEFAZ: em homologação o nome do destinatário é este texto.
export const HOMOLOGACAO_DEST_NAME = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';

export const UF_CODE: Record<string, number> = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53,
};

const reais = (cents: number) => (cents / 100).toFixed(2);
const digits = (v: string | undefined) => (v ?? '').replace(/\D/g, '');
// A SEFAZ recusa quebras de linha, caracteres de controle e espaços nas pontas.
const clean = (v: string | undefined, max: number) => (v ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();

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

/** Dígito verificador da chave de acesso (módulo 11, pesos 2 a 9 da direita para a esquerda). */
export function chaveDv(base43: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    sum += Number(base43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

/** Chave de acesso de 44 dígitos. */
export function chaveAcesso(uf: string, dhEmi: string, cnpj: string, serie: number, numero: number, cNF: string): string {
  const aamm = dhEmi.slice(2, 4) + dhEmi.slice(5, 7);
  const base = `${UF_CODE[uf]}${aamm}${cnpj}55${String(serie).padStart(3, '0')}${String(numero).padStart(9, '0')}1${cNF}`;
  return base + chaveDv(base);
}

/** Código numérico aleatório da chave (8 dígitos, diferente do número da nota). */
export function randomCNF(numero: number): string {
  for (;;) {
    const c = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    if (Number(c) !== numero) return c;
  }
}

interface Amounts { gross: number[]; productsCents: number; shippingCents: number; discountCents: number; otherCents: number }

function amounts(order: NfeOrder): Amounts {
  const items = order.items ?? [];
  const gross = items.map(i => i.unitPrice * i.quantity);
  const productsCents = gross.reduce((a, b) => a + b, 0);
  const shippingCents = Math.max(0, order.shippingCents ?? 0);
  const discountCents = Math.max(0, order.discountCents ?? ((order.pixDiscountCents ?? 0) + (order.couponDiscountCents ?? 0)));
  // O que o cliente pagou além de produtos − descontos + frete: o acréscimo
  // do parcelamento no cartão. Entra como "outras despesas acessórias".
  const otherCents = order.totalCents - (productsCents - discountCents + shippingCents);
  return { gross, productsCents, shippingCents, discountCents, otherCents };
}

/**
 * Tudo o que impede a nota de sair, antes de gastar um número. Vazio = ok.
 * (O município do cliente é conferido depois, pela consulta do CEP.)
 */
export function nfeProblems(order: NfeOrder, customer: NfeCustomer, config: NfeConfig, homologacao: boolean): string[] {
  const problems: string[] = [];
  const addr = order.address ?? {};
  const uf = (addr.state ?? '').trim().toUpperCase();
  if (!isValidCpf(digits(customer.cpf))) problems.push('CPF do cliente ausente ou inválido');
  if (!homologacao && clean(customer.name, 60).length < 2) problems.push('nome do cliente');
  if (!isValidCep(addr.cep ?? '')) problems.push('CEP do endereço');
  if (!clean(addr.street, 60)) problems.push('rua do endereço');
  if (!clean(addr.number, 60)) problems.push('número do endereço');
  if (!clean(addr.neighborhood, 60)) problems.push('bairro do endereço');
  if (!clean(addr.city, 60)) problems.push('cidade do endereço');
  if (!UF_CODE[uf]) problems.push('UF do endereço');

  if (digits(config.cnpj).length !== 14) problems.push('CNPJ da loja (configurações)');
  if (clean(config.razaoSocial, 60).length < 2) problems.push('razão social (configurações)');
  if (!config.ie) problems.push('inscrição estadual (configurações)');
  if (!UF_CODE[config.ufEmitente]) problems.push('UF da loja (configurações)');
  if (!/^\d{7}$/.test(config.codMunicipio)) problems.push('código IBGE do município da loja (configurações)');
  if (!clean(config.logradouro, 60) || !clean(config.bairro, 60) || config.cep.length !== 8) problems.push('endereço completo da loja (configurações)');
  if (!/^\d{8}$/.test(config.ncm)) problems.push('NCM (8 dígitos, configurações)');

  const items = (order.items ?? []).filter(i => i.quantity > 0);
  if (items.length === 0) problems.push('pedido sem itens');
  if (items.length > 990) problems.push('pedido com itens demais para uma nota');
  if (items.some(i => !Number.isInteger(i.unitPrice) || i.unitPrice <= 0 || !Number.isInteger(i.quantity))) problems.push('item com preço ou quantidade inválidos');
  const a = amounts(order);
  if (typeof order.productsCents === 'number' && order.productsCents !== a.productsCents) problems.push('soma dos itens diferente do valor de produtos do pedido');
  if (a.discountCents > a.productsCents) problems.push('desconto maior que o valor dos produtos');
  if (a.otherCents < 0) problems.push('total do pedido menor que produtos − desconto + frete');
  return problems;
}

const PIS_NT = new Set(['04', '05', '06', '07', '08', '09']);

/** Monta a NF-e no formato da nfewizard-io. Lança NfeDataError se faltar algo. */
export function buildNfe(order: NfeOrder, customer: NfeCustomer, config: NfeConfig, id: NfeIdentity) {
  const problems = nfeProblems(order, customer, config, id.homologacao);
  if (!/^\d{7}$/.test(id.cMunDest)) problems.push('código IBGE da cidade do cliente (CEP não encontrado)');
  if (problems.length > 0) throw new NfeDataError(problems);

  const addr = order.address!;
  const uf = addr.state!.trim().toUpperCase();
  const items = order.items.filter(i => i.quantity > 0);
  const a = amounts({ ...order, items });
  const discounts = apportion(a.discountCents, a.gross);
  const freights = apportion(a.shippingCents, a.gross);
  const others = apportion(a.otherCents, a.gross);
  const interestadual = uf !== config.ufEmitente;
  const cfop = Number(interestadual ? config.cfopInterestadual : config.cfopInterno);
  const pickup = order.delivery?.carrier === 'pickup';
  const chave = chaveAcesso(config.ufEmitente, id.dhEmi, digits(config.cnpj), id.serie, id.numero, id.cNF);
  const pisGroup = (cst: string) => (PIS_NT.has(cst) ? 'NT' : 'Outr');

  const det = items.map((item, i) => {
    const variant = [item.variant?.size, item.variant?.colorName ?? item.variant?.color].filter(Boolean).join(' ');
    const xProd = clean(variant && !item.productName.toLowerCase().includes(variant.toLowerCase()) ? `${item.productName} ${variant}` : item.productName, 120);
    const pis = pisGroup(config.pisCofinsCst);
    return {
      prod: {
        cProd: clean(item.sku, 60),
        cEAN: 'SEM GTIN',
        xProd,
        NCM: config.ncm,
        CFOP: cfop,
        uCom: 'UN',
        qCom: item.quantity,
        vUnCom: reais(item.unitPrice),
        vProd: reais(a.gross[i]),
        cEANTrib: 'SEM GTIN',
        uTrib: 'UN',
        qTrib: item.quantity,
        vUnTrib: reais(item.unitPrice),
        ...(freights[i] > 0 ? { vFrete: reais(freights[i]) } : {}),
        ...(discounts[i] > 0 ? { vDesc: reais(discounts[i]) } : {}),
        ...(others[i] > 0 ? { vOutro: reais(others[i]) } : {}),
        indTot: 1,
      },
      imposto: {
        ICMS: { ICMSSN102: { orig: Number(config.origem), CSOSN: Number(config.csosn) as 102 } },
        PIS: pis === 'NT' ? { PISNT: { CST: config.pisCofinsCst } } : { PISOutr: { CST: config.pisCofinsCst, vBC: 0, pPIS: 0, vPIS: 0 } },
        COFINS: pis === 'NT' ? { COFINSNT: { CST: config.pisCofinsCst } } : { COFINSOutr: { CST: config.pisCofinsCst, vBC: 0, pCOFINS: 0, vCOFINS: 0 } },
      },
      ...(item.note ? { infAdProd: clean(item.note, 500) } : {}),
    };
  });

  const zero = '0.00';
  const infNFe = {
    Id: chave,
    ide: {
      cUF: UF_CODE[config.ufEmitente],
      cNF: id.cNF,
      natOp: clean(config.naturezaOperacao, 60),
      mod: 55,
      serie: String(id.serie),
      nNF: id.numero,
      dhEmi: id.dhEmi,
      dhSaiEnt: id.dhEmi,
      tpNF: 1,
      idDest: interestadual ? 2 : 1,
      cMunFG: Number(config.codMunicipio),
      tpImp: 1,
      tpEmis: 1,
      cDV: Number(chave.slice(-1)),
      tpAmb: id.homologacao ? 2 : 1,
      finNFe: 1,
      indFinal: 1,
      indPres: 2, // internet
      indIntermed: 0, // site próprio
      procEmi: 0,
      verProc: 'Mikma 1.0',
    },
    emit: {
      CNPJCPF: digits(config.cnpj),
      xNome: clean(config.razaoSocial, 60),
      ...(config.nomeFantasia ? { xFant: clean(config.nomeFantasia, 60) } : {}),
      enderEmit: {
        xLgr: clean(config.logradouro, 60),
        nro: clean(config.numero, 60),
        ...(config.complemento ? { xCpl: clean(config.complemento, 60) } : {}),
        xBairro: clean(config.bairro, 60),
        cMun: Number(config.codMunicipio),
        xMun: clean(config.municipio, 60),
        UF: config.ufEmitente,
        CEP: config.cep,
        cPais: 1058,
        xPais: 'BRASIL',
        ...(config.telefone.length >= 10 ? { fone: config.telefone.slice(0, 14) } : {}),
      },
      IE: config.ie,
      CRT: config.crt,
    },
    dest: {
      CNPJCPF: digits(customer.cpf),
      xNome: id.homologacao ? HOMOLOGACAO_DEST_NAME : clean(customer.name, 60),
      enderDest: {
        xLgr: clean(addr.street, 60),
        nro: clean(addr.number, 60),
        ...(clean(addr.complement, 60) ? { xCpl: clean(addr.complement, 60) } : {}),
        xBairro: clean(addr.neighborhood, 60),
        cMun: Number(id.cMunDest),
        xMun: clean(addr.city, 60),
        UF: uf,
        CEP: digits(addr.cep),
        cPais: 1058,
        xPais: 'BRASIL',
        ...(digits(customer.phone).length >= 10 ? { fone: digits(customer.phone).slice(0, 14) } : {}),
      },
      indIEDest: 9, // não contribuinte
      ...(customer.email ? { email: clean(customer.email, 60) } : {}),
    },
    det,
    total: {
      ICMSTot: {
        vBC: zero, vICMS: zero, vICMSDeson: zero, vFCP: zero, vBCST: zero, vST: zero, vFCPST: zero, vFCPSTRet: zero,
        vProd: reais(a.productsCents),
        vFrete: reais(a.shippingCents),
        vSeg: zero,
        vDesc: reais(a.discountCents),
        vII: zero, vIPI: zero, vIPIDevol: zero, vPIS: zero, vCOFINS: zero,
        vOutro: reais(a.otherCents),
        vNF: reais(order.totalCents),
      },
    },
    // Retirada na loja: sem frete. Entrega: contratada pela loja (CIF).
    transp: { modFrete: pickup ? 9 : 0 },
    pag: {
      detPag: {
        indPag: 0,
        // 17 = PIX dinâmico; 03 = cartão de crédito. Pagamento não integrado
        // à automação (feito pela AbacatePay).
        tPag: order.payment?.method === 'pix' ? '17' : '03',
        vPag: reais(order.totalCents),
        card: { tpIntegra: '2' as const },
      },
    },
    infAdic: { infCpl: clean(`${config.infoAdicional} Pedido ${order.id.slice(-8).toUpperCase()}.`, 2000) },
    ...(config.email && config.telefone.length >= 10 ? {
      infRespTec: { CNPJ: digits(config.cnpj), xContato: clean(config.razaoSocial, 60), email: clean(config.email, 60), fone: config.telefone.slice(0, 14) },
    } : {}),
  };

  return { chave, nfe: { indSinc: 1, idLote: id.numero, NFe: { infNFe } } };
}
