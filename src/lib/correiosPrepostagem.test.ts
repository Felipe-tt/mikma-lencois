import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/uber-direct', () => ({}));

import { buildPrePostagem, cancelPrePostagem, createPrePostagem, labelPdf, prePostagemProblems, remetenteFrom, remetenteProblems, type Remetente } from './correiosPrepostagem';
import { withStoreDefaults } from './store-settings';
import { resetCorreiosToken } from './correiosContrato';
import type { Order } from '@/types';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const loja: Remetente = {
  nome: 'GPM Textil Ltda', cnpj: '05.338.341/0001-95', telefone: '(47) 99999-0000', email: 'contato@mikma.com.br',
  endereco: { cep: '89042-300', street: 'Rua da Loja', number: '100', neighborhood: 'Velha', city: 'Blumenau', state: 'sc' },
};
const pedido = {
  id: 'ord_abc123def456',
  customerName: 'Ana Prado',
  customerEmail: 'ana@exemplo.com',
  delivery: { carrier: 'correios_sedex' },
  address: { cep: '01310-100', street: 'Avenida Paulista', number: '1000', complement: 'apto 12', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
  items: [
    { productId: 'p3', productName: 'Jogo de Cama King Malha Cinza', sku: 'p3_v1', variant: {}, quantity: 1, unitPrice: 39990 },
    { productId: 'p3', productName: 'Jogo de Cama King Malha Cinza', sku: 'p3_v2', variant: {}, quantity: 1, unitPrice: 39990 },
    { productId: 'p4', productName: 'Fronha Avulsa Malha Azul', sku: 'p4_v1', variant: {}, quantity: 2, unitPrice: 3990 },
  ],
} as unknown as Order;

describe('buildPrePostagem', () => {
  it('monta remetente (loja), destinatário, serviço, caixa pelo peso e declaração de conteúdo', () => {
    const body = buildPrePostagem(pedido, loja, { weightKg: 1.5, coleta: true });
    expect(body.remetente).toEqual({
      nome: 'GPM Textil Ltda', cpfCnpj: '05338341000195', dddCelular: '47', celular: '999990000', email: 'contato@mikma.com.br',
      endereco: { cep: '89042300', logradouro: 'Rua da Loja', numero: '100', bairro: 'Velha', cidade: 'Blumenau', uf: 'SC' },
    });
    expect(body.destinatario).toEqual({
      nome: 'Ana Prado', email: 'ana@exemplo.com',
      endereco: { cep: '01310100', logradouro: 'Avenida Paulista', numero: '1000', complemento: 'apto 12', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP', regiao: '' },
    });
    expect(body).toMatchObject({
      codigoServico: '03220', pesoInformado: '1500', codigoFormatoObjetoInformado: '2',
      comprimentoInformado: '30', larguraInformada: '25', alturaInformada: '10',
      cienteObjetoNaoProibido: '1', solicitarColeta: 'S', observacao: 'Pedido ABC123DE',
    });
    expect(body.itensDeclaracaoConteudo).toEqual([
      { conteudo: 'Jogo de Cama King Malha Cinza', quantidade: '2', valor: '399.90' },
      { conteudo: 'Fronha Avulsa Malha Azul', quantidade: '2', valor: '39.90' },
    ]);
    expect(body).not.toHaveProperty('chaveNFe');
  });

  it('PAC, sem coleta, peso mínimo de 300 g e chave da NF-e autorizada', () => {
    const order = { ...pedido, delivery: { carrier: 'correios_pac' }, nfe: { status: 'autorizada', chave: '4'.repeat(44) } } as unknown as Order;
    const body = buildPrePostagem(order, loja, { weightKg: 0.1, coleta: false });
    expect(body).toMatchObject({ codigoServico: '03298', pesoInformado: '300', solicitarColeta: 'N', chaveNFe: '4'.repeat(44) });
  });

  it('NF-e que não foi autorizada não vai', () => {
    const order = { ...pedido, nfe: { status: 'erro', chave: '4'.repeat(44) } } as unknown as Order;
    expect(buildPrePostagem(order, loja, { weightKg: 1, coleta: true })).not.toHaveProperty('chaveNFe');
  });

  it('corta textos no tamanho que os Correios aceitam', () => {
    const order = { ...pedido, customerName: 'N'.repeat(80), address: { ...pedido.address, street: 'R'.repeat(80), neighborhood: 'B'.repeat(40), number: '1234567' } } as unknown as Order;
    const body = buildPrePostagem(order, loja, { weightKg: 1, coleta: true });
    expect(body.destinatario.nome).toHaveLength(50);
    expect(body.destinatario.endereco.logradouro).toHaveLength(50);
    expect(body.destinatario.endereco.bairro).toHaveLength(30);
    expect(body.destinatario.endereco.numero).toBe('123456');
  });
});

describe('prePostagemProblems', () => {
  it('pedido e loja completos: nada falta', () => {
    expect(prePostagemProblems(pedido, loja)).toEqual([]);
  });
  it('aponta o que falta para gerar', () => {
    const order = { ...pedido, delivery: { carrier: 'jadlog_package' }, customerName: '' } as unknown as Order;
    const semLoja = { ...loja, cnpj: '', endereco: { ...loja.endereco, street: '' } };
    const problems = prePostagemProblems(order, semLoja);
    expect(problems).toEqual([
      'Este pedido não é por PAC ou SEDEX.',
      'Falta o CNPJ da loja (Configurações > Loja).',
      'Falta o endereço completo da loja (Configurações > Loja): é dele que os Correios coletam.',
      'Falta o nome do cliente no pedido.',
    ]);
  });
});

describe('remetente das Configurações', () => {
  it('usa razão social e CNPJ da NF-e quando tem, e o endereço da loja', () => {
    const r = remetenteFrom(withStoreDefaults({
      storeName: 'Mikma Lençóis', storeCnpj: '11.111.111/0001-11', nfeRazaoSocial: 'GPM Textil Ltda', nfeCnpj: '05338341000195',
      storeCep: '89042-300', storeAddress: 'Rua A', storeNumber: '10', storeNeighborhood: 'Velha', storeCity: 'Blumenau', storeState: 'SC',
    }));
    expect(r).toMatchObject({ nome: 'GPM Textil Ltda', cnpj: '05338341000195', endereco: { cep: '89042-300', street: 'Rua A', city: 'Blumenau' } });
    expect(remetenteProblems(r)).toEqual([]);
  });
  it('sem CEP da loja, usa o CEP de origem do frete; loja vazia aponta tudo', () => {
    const r = remetenteFrom(withStoreDefaults({ originCep: '89042300' }));
    expect(r.endereco.cep).toBe('89042300');
    expect(remetenteProblems(r)).toHaveLength(3);
  });
});

describe('chamadas à API de pré-postagem', () => {
  const tokenOk = () => json({ token: 't', expiraEm: '2099-01-01T10:00:00', cartaoPostagem: { contrato: '9912490489', dr: 68 } }, 201);

  beforeEach(() => {
    resetCorreiosToken();
    vi.stubEnv('CORREIOS_CWS', 'loja:codigo');
    vi.stubEnv('CORREIOS_CARTAO', '0075520150');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('cria e devolve id e código de rastreio', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/token/')) return tokenOk();
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer t');
      return json({ id: 'pp1', codigoObjeto: 'AB123456789BR', statusAtual: 7 });
    });
    vi.stubGlobal('fetch', f);
    expect(await createPrePostagem(buildPrePostagem(pedido, loja, { weightKg: 1, coleta: true }))).toEqual({ id: 'pp1', codigoObjeto: 'AB123456789BR' });
  });

  it('erro de validação dos Correios vira mensagem para o painel', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/token/') ? tokenOk() : json({ msgs: ['PPN-123: CEP inválido'] }, 400))));
    await expect(createPrePostagem(buildPrePostagem(pedido, loja, { weightKg: 1, coleta: true }))).rejects.toThrow('Os Correios recusaram: PPN-123: CEP inválido');
  });

  it('token vencido (401): pede outro e tenta de novo uma vez', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/token/')) return tokenOk();
      calls++;
      return calls === 1 ? json({}, 401) : json({ id: 'pp2', codigoObjeto: 'CD123456789BR' });
    }));
    expect((await createPrePostagem(buildPrePostagem(pedido, loja, { weightKg: 1, coleta: true }))).id).toBe('pp2');
  });

  it('etiqueta: pede o rótulo, espera ficar pronto e devolve o PDF', async () => {
    let downloads = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/token/')) return tokenOk();
      if (url.endsWith('/rotulo/assincrono/pdf')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ idsPrePostagem: ['pp1'], tipoRotulo: 'P', formatoRotulo: 'ET' });
        return json({ idRecibo: 'r1' });
      }
      if (url.endsWith('/rotulo/download/assincrono/r1')) {
        downloads++;
        return downloads === 1 ? json({ mensagem: 'PPN-291: rótulo em geração' }) : json({ nome: 'r1.pdf', dados: Buffer.from('%PDF-1.4 teste').toString('base64') });
      }
      throw new Error(url);
    }));
    const pdf = await labelPdf('pp1', { waitMs: 1 });
    expect(pdf.toString()).toBe('%PDF-1.4 teste');
    expect(downloads).toBe(2);
  });

  it('várias etiquetas num PDF só; lista vazia nem chama os Correios', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/token/')) return tokenOk();
      if (url.endsWith('/rotulo/assincrono/pdf')) { bodies.push(JSON.parse(String(init?.body))); return json({ idRecibo: 'r2' }); }
      return json({ nome: 'r2.pdf', dados: Buffer.from('%PDF-lote').toString('base64') });
    }));
    expect((await labelPdf(['pp1', 'pp2', ''], { waitMs: 1 })).toString()).toBe('%PDF-lote');
    expect(bodies).toEqual([expect.objectContaining({ idsPrePostagem: ['pp1', 'pp2'] })]);
    await expect(labelPdf([], { waitMs: 1 })).rejects.toThrow('Nenhuma etiqueta para imprimir.');
  });

  it('etiqueta que não fica pronta: erro claro', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/token/')) return tokenOk();
      if (url.endsWith('/rotulo/assincrono/pdf')) return json({ idRecibo: 'r1' });
      return json({ mensagem: 'PPN-291: rótulo em geração' });
    }));
    await expect(labelPdf('pp1', { tries: 3, waitMs: 1 })).rejects.toThrow('A etiqueta ainda não ficou pronta');
  });

  it('cancelar: ok, e "já cancelada" também conta como ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/token/')) return tokenOk();
      expect(init?.method).toBe('DELETE');
      return url.endsWith('/pp1') ? json({ resultadoCancelamento: 'Cancelado' }) : json({ msgs: ['PPN-145-5: pré-postagem já cancelada'] }, 400);
    }));
    await expect(cancelPrePostagem('pp1')).resolves.toBeUndefined();
    await expect(cancelPrePostagem('pp9')).resolves.toBeUndefined();
  });
});
