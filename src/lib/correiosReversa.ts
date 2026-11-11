/**
 * Logística reversa pelo contrato dos Correios: troca ou devolução aprovada
 * no painel gera um código de postagem. O cliente leva o pacote a qualquer
 * agência, sem pagar (a loja paga no contrato), e os Correios mandam o
 * código por e-mail para ele. Sem Portal Postal.
 *
 * Testado no contrato real: PAC reverso (03301) aceita a pré-postagem com
 * `logisticaReversa: 'S'` e `dataValidadeLogReversa` em dd/MM/yyyy; o
 * remetente é o cliente (nome, CPF, e-mail e endereço) e o destinatário é
 * a loja. A resposta traz `codigoObjeto` e `emailLogisticaReversaEnviado`.
 */
import { packageFor } from '@/lib/shipping-pricing';
import { cut, digits, endereco, phoneFields, type Remetente } from '@/lib/correiosPrepostagem';
import type { Address, Order, ReturnRequest } from '@/types';

export const SERVICO_REVERSO = '03301'; // PAC reverso
/** Dias que o cliente tem para levar o pacote à agência. */
export const PRAZO_REVERSA_DIAS = 15;

export interface ReversaInfo {
  id: string;
  codigoObjeto: string;
  /** Último dia para postar (ISO, data). */
  validade: string;
  createdAt: string;
  /** Quando chegou de volta à loja (rastreio). */
  entregueEm?: string;
}

export interface ClienteReversa {
  nome: string;
  cpf: string;
  email: string;
  telefone?: string;
  endereco: Address;
}

/** O que falta para gerar o código de devolução (vazio = pode gerar). */
export function reversaProblems(cliente: ClienteReversa, loja: Remetente): string[] {
  const p: string[] = [];
  if (cut(cliente.nome, 50).length < 3) p.push('Falta o nome do cliente.');
  if (digits(cliente.cpf).length !== 11) p.push('Falta o CPF do cliente (os Correios exigem na devolução).');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cliente.email)) p.push('Falta o e-mail do cliente (é para onde os Correios mandam o código).');
  const a = cliente.endereco;
  if (!a || digits(a.cep).length !== 8 || !a.street || !a.neighborhood || !a.city || !a.state) p.push('O endereço do cliente no pedido está incompleto.');
  if (digits(loja.cnpj).length !== 14 || digits(loja.endereco.cep).length !== 8 || !loja.endereco.street) p.push('Faltam o CNPJ ou o endereço da loja (Configurações > Loja).');
  return p;
}

/** dd/MM/yyyy, como a API pede. */
export function brDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

export function buildReversa(
  devolucao: Pick<ReturnRequest, 'id' | 'orderId' | 'items' | 'type'>,
  order: Pick<Order, 'items'>,
  cliente: ClienteReversa,
  loja: Remetente,
  opts: { weightKg: number; now?: Date },
) {
  const pkg = packageFor(opts.weightKg);
  const validade = new Date((opts.now ?? new Date()).getTime() + PRAZO_REVERSA_DIAS * 86_400_000);
  // Valor de cada item: o que o cliente pagou no pedido.
  const preco = new Map(order.items.map(i => [i.sku, i.unitPrice]));
  const itens = new Map<string, { quantidade: number; valor: number }>();
  for (const i of devolucao.items) {
    const nome = cut(i.productName, 60).padEnd(2, '.');
    const prev = itens.get(nome);
    itens.set(nome, { quantidade: (prev?.quantidade ?? 0) + i.quantity, valor: preco.get(i.sku) ?? 0 });
  }
  return {
    body: {
      remetente: {
        nome: cut(cliente.nome, 50),
        cpfCnpj: digits(cliente.cpf),
        email: cut(cliente.email, 255),
        ...phoneFields(cliente.telefone),
        endereco: endereco(cliente.endereco),
      },
      destinatario: {
        nome: cut(loja.nome, 50),
        cpfCnpj: digits(loja.cnpj),
        ...phoneFields(loja.telefone),
        ...(loja.email ? { email: cut(loja.email, 255) } : {}),
        endereco: { ...endereco(loja.endereco), regiao: '' },
      },
      codigoServico: SERVICO_REVERSO,
      pesoInformado: String(Math.max(300, Math.round(opts.weightKg * 1000))),
      codigoFormatoObjetoInformado: '2',
      comprimentoInformado: String(pkg.lengthCm),
      larguraInformada: String(pkg.widthCm),
      alturaInformada: String(pkg.heightCm),
      cienteObjetoNaoProibido: '1',
      logisticaReversa: 'S',
      dataValidadeLogReversa: brDate(validade),
      itensDeclaracaoConteudo: [...itens].map(([conteudo, v]) => ({ conteudo, quantidade: String(v.quantidade), valor: (Math.max(v.valor, 1) / 100).toFixed(2) })),
      observacao: cut(`${devolucao.type === 'troca' ? 'Troca' : 'Devolucao'} pedido ${devolucao.orderId.replace(/^ord_/, '').slice(0, 8).toUpperCase()}`, 50),
      pedidoExternoOrigem: cut(devolucao.id, 25),
    },
    validade: validade.toISOString().slice(0, 10),
  };
}
