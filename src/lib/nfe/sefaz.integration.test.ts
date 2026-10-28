import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import forge from 'node-forge';
import { authorize, consult, cancel, danfePdf } from './sefaz';
import { buildNfe } from './payload';
import { nfeConfigFrom } from './config';
import { readCertificate } from './certificate';

/**
 * Integração com a nfewizard-io de verdade (geração do XML, assinatura com
 * certificado A1, envelope SOAP, leitura da resposta), com a SEFAZ simulada:
 * as chamadas HTTP são interceptadas no axios que a biblioteca usa.
 */

function selfSignedPfx(cnpj: string, password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const attrs = [{ name: 'commonName', value: `MIKMA TESTE LTDA:${cnpj}` }, { name: 'countryName', value: 'BR' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

const CNPJ = '29966649000143';
const cert: { pfx: Buffer; password: string } = { pfx: Buffer.alloc(0), password: 'senha-teste' };
const config = nfeConfigFrom({
  storeName: 'Mikma Lençóis', storeState: 'SC', storeCity: 'Blumenau', storeAddress: 'Rua das Flores', storeNumber: '10',
  storeNeighborhood: 'Centro', storeCep: '89010-100', storePhone: '(47) 3333-4444', storeEmail: 'contato@mikma.com.br',
  nfeRazaoSocial: 'MIKMA COMERCIO LTDA', nfeIe: '255520060', nfeCnpj: CNPJ,
});
const order = {
  id: 'ord_teste12345678',
  items: [{ sku: 'p1_queen', productName: 'Jogo de cama Queen', quantity: 2, unitPrice: 18990 }, { sku: 'p2_v1', productName: 'Fronha', quantity: 1, unitPrice: 3333 }],
  productsCents: 41313, shippingCents: 2500, totalCents: 43813,
  address: { cep: '01310-100', street: 'Av Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
  payment: { method: 'pix' }, delivery: { carrier: 'correios_pac' },
};
const customer = { name: 'Maria da Silva', cpf: '52998224725', email: 'maria@ex.com', phone: '47999990000' };

type Reply = (body: string, url: string) => string | Error;
let reply: Reply = () => '';
const requests: { url: string; body: string }[] = [];
const originalCreate = axios.create;

const soap = (inner: string) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>${inner}</soap:Body></soap:Envelope>`;
const chaveOf = (body: string) => body.match(/Id="NFe(\d{44})"/)?.[1] ?? body.match(/<chNFe>(\d{44})<\/chNFe>/)?.[1] ?? '';
const autorizada = (body: string) => soap(`<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4"><retEnviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SVRS2026</verAplic><cStat>104</cStat><xMotivo>Lote processado</xMotivo><cUF>42</cUF><dhRecbto>2026-10-27T12:00:05-03:00</dhRecbto><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SVRS2026</verAplic><chNFe>${chaveOf(body)}</chNFe><dhRecbto>2026-10-27T12:00:05-03:00</dhRecbto><nProt>342260000012345</nProt><digVal>abc=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retEnviNFe></nfeResultMsg>`);
const rejeitada = (cStat: string, motivo: string) => (body: string) => soap(`<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4"><retEnviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SVRS2026</verAplic><cStat>104</cStat><xMotivo>Lote processado</xMotivo><cUF>42</cUF><dhRecbto>2026-10-27T12:00:05-03:00</dhRecbto><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SVRS2026</verAplic><chNFe>${chaveOf(body)}</chNFe><dhRecbto>2026-10-27T12:00:05-03:00</dhRecbto><cStat>${cStat}</cStat><xMotivo>${motivo}</xMotivo></infProt></protNFe></retEnviNFe></nfeResultMsg>`);

beforeAll(() => {
  cert.pfx = selfSignedPfx(CNPJ, cert.password);
  (axios as unknown as { create: unknown }).create = () => ({
    post: async (url: string, body: string) => {
      requests.push({ url, body });
      const r = reply(body, url);
      if (r instanceof Error) throw r;
      return { data: r, status: 200 };
    },
    get: async () => ({ data: '' }),
    interceptors: { request: { use: () => 0 }, response: { use: () => 0 } },
    defaults: { headers: {} },
  });
}, 60_000);
afterAll(() => { (axios as unknown as { create: unknown }).create = originalCreate; });

describe('nfewizard-io com SEFAZ simulada', () => {
  it('nunca escreve senha, certificado ou CPF no log do servidor', async () => {
    const out: string[] = [];
    const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info, table: console.table, out: process.stdout.write, err: process.stderr.write };
    const grab = (...a: unknown[]) => { out.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
    Object.assign(console, { log: grab, error: grab, warn: grab, info: grab, table: grab });
    process.stdout.write = ((c: unknown) => { out.push(String(c)); return true; }) as typeof process.stdout.write;
    process.stderr.write = ((c: unknown) => { out.push(String(c)); return true; }) as typeof process.stderr.write;
    try {
      const { nfe, chave } = buildNfe(order, customer, config, { numero: 30, serie: 1, cNF: '31415926', dhEmi: '2026-10-27T12:00:00-03:00', homologacao: false, cMunDest: '3550308' });
      reply = autorizada;
      expect((await authorize('homologacao', cert, 'SC', CNPJ, nfe, chave)).kind).toBe('autorizada');
      reply = () => Object.assign(new Error('Request failed with status code 403'), { isAxiosError: true });
      await authorize('homologacao', cert, 'SC', CNPJ, nfe, chave);
    } finally {
      Object.assign(console, { log: orig.log, error: orig.error, warn: orig.warn, info: orig.info, table: orig.table });
      process.stdout.write = orig.out;
      process.stderr.write = orig.err;
    }
    const all = out.join('\n');
    expect(all).not.toContain(cert.password);
    expect(all).not.toContain('senhaCertificado');
    expect(all).not.toContain(customer.cpf);
    expect(all).not.toContain('pathCertificado');
  }, 60_000);

  it('lê o certificado: titular, CNPJ e validade', () => {
    const info = readCertificate(cert.pfx, cert.password);
    expect(info.cnpj).toBe(CNPJ);
    expect(info.titular).toBe('MIKMA TESTE LTDA');
    expect(() => readCertificate(cert.pfx, 'errada')).toThrow(/senha/);
  });

  it('autoriza: XML assinado, chave certa, endpoint de homologação da SVRS e nfeProc salvo', async () => {
    const { nfe, chave } = buildNfe(order, customer, config, { numero: 7, serie: 1, cNF: '87654321', dhEmi: '2026-10-27T12:00:00-03:00', homologacao: true, cMunDest: '3550308' });
    reply = autorizada;
    const res = await authorize('homologacao', cert, 'SC', CNPJ, nfe, chave);
    if (res.kind !== 'autorizada') console.log('MOTIVO', JSON.stringify(res));
    const req = requests.at(-1)!;
    expect(req.url).toMatch(/hom/i);
    expect(req.body).toContain(`Id="NFe${chave}"`);
    expect(req.body).toContain('<Signature');
    expect(req.body).toContain('<CPF>52998224725</CPF>');
    expect(req.body).toContain('<vNF>438.13</vNF>');
    expect(req.body).toContain('<tPag>17</tPag>');
    expect(res.kind).toBe('autorizada');
    if (res.kind === 'autorizada') {
      expect(res.nProt).toBe('342260000012345');
      expect(res.xml ?? '').toContain('<nfeProc');
      expect(res.xml ?? '').toContain('<protNFe');
    }
  }, 60_000);

  it('rejeição vira "rejeitada" com o motivo; denegação e duplicidade classificadas', async () => {
    const { nfe, chave } = buildNfe(order, customer, config, { numero: 8, serie: 1, cNF: '11223344', dhEmi: '2026-10-27T12:00:00-03:00', homologacao: true, cMunDest: '3550308' });
    reply = rejeitada('225', 'Rejeição: Falha no Schema XML da NFe');
    const r1 = await authorize('homologacao', cert, 'SC', CNPJ, nfe, chave);
    expect(r1.kind).toBe('rejeitada');
    reply = rejeitada('301', 'Uso Denegado: Irregularidade fiscal do emitente');
    expect((await authorize('homologacao', cert, 'SC', CNPJ, nfe, chave)).kind).toBe('denegada');
    reply = rejeitada('204', 'Rejeição: Duplicidade de NF-e');
    expect((await authorize('homologacao', cert, 'SC', CNPJ, nfe, chave)).kind).toBe('duplicada');
  }, 60_000);

  it('erro HTTP do webservice (403/500) também vira "incerta", nunca rejeição', async () => {
    const { nfe, chave } = buildNfe(order, customer, config, { numero: 11, serie: 1, cNF: '13572468', dhEmi: '2026-10-27T12:00:00-03:00', homologacao: true, cMunDest: '3550308' });
    for (const status of [403, 500, 503]) {
      reply = () => Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status } });
      expect((await authorize('homologacao', cert, 'SC', CNPJ, nfe, chave)).kind).toBe('incerta');
    }
  }, 60_000);

  it('sem resposta (rede) vira "incerta": nunca é tratada como rejeição', async () => {
    const { nfe, chave } = buildNfe(order, customer, config, { numero: 9, serie: 1, cNF: '55667788', dhEmi: '2026-10-27T12:00:00-03:00', homologacao: true, cMunDest: '3550308' });
    reply = () => Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED', isAxiosError: true });
    expect((await authorize('homologacao', cert, 'SC', CNPJ, nfe, chave)).kind).toBe('incerta');
  }, 60_000);

  it('consulta: autorizada, inexistente e cancelada', async () => {
    const chave = '42261029966649000143550010000000071876543210';
    reply = () => soap(`<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4"><retConsSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo><cUF>42</cUF><dhRecbto>2026-10-27T12:00:05-03:00</dhRecbto><chNFe>${chave}</chNFe><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><chNFe>${chave}</chNFe><dhRecbto>2026-10-27T12:00:05-03:00</dhRecbto><nProt>342260000099999</nProt><digVal>x=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retConsSitNFe></nfeResultMsg>`);
    const c1 = await consult('homologacao', cert, 'SC', CNPJ, chave);
    expect(c1.kind).toBe('autorizada');
    if (c1.kind === 'autorizada') expect(c1.nProt).toBe('342260000099999');
    reply = () => soap(`<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4"><retConsSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><cStat>217</cStat><xMotivo>Rejeicao: NF-e nao consta na base de dados da SEFAZ</xMotivo><cUF>42</cUF><chNFe>${chave}</chNFe></retConsSitNFe></nfeResultMsg>`);
    expect((await consult('homologacao', cert, 'SC', CNPJ, chave)).kind).toBe('inexistente');
    reply = () => soap(`<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4"><retConsSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><cStat>101</cStat><xMotivo>Cancelamento de NF-e homologado</xMotivo><cUF>42</cUF><chNFe>${chave}</chNFe></retConsSitNFe></nfeResultMsg>`);
    expect((await consult('homologacao', cert, 'SC', CNPJ, chave)).kind).toBe('cancelada');
  }, 60_000);

  it('cancelamento: evento 110111 assinado', async () => {
    const chave = '42261029966649000143550010000000071876543210';
    reply = body => soap(`<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><retEnvEvento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>1</idLote><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><cOrgao>42</cOrgao><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo><retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><cOrgao>42</cOrgao><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${chaveOf(body)}</chNFe><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><dhRegEvento>2026-10-27T13:00:00-03:00</dhRegEvento><nProt>342260000088888</nProt></infEvento></retEvento></retEnvEvento></nfeResultMsg>`);
    const r = await cancel('homologacao', cert, 'SC', CNPJ, { chave, nProt: '342260000099999', justificativa: 'Venda cancelada a pedido do cliente', dhEvento: '2026-10-27T13:00:00-03:00', ufCode: 42 });
    const req = requests.at(-1)!;
    expect(req.body).toContain('<tpEvento>110111</tpEvento>');
    expect(req.body).toContain('<Signature');
    expect(r.ok).toBe(true);
  }, 60_000);

  it('gera a DANFE em PDF a partir do XML autorizado', async () => {
    const { nfe, chave } = buildNfe(order, customer, config, { numero: 10, serie: 1, cNF: '99887766', dhEmi: '2026-10-27T12:00:00-03:00', homologacao: true, cMunDest: '3550308' });
    reply = autorizada;
    const res = await authorize('homologacao', cert, 'SC', CNPJ, nfe, chave);
    expect(res.kind).toBe('autorizada');
    const pdf = await danfePdf((res as { xml: string }).xml, chave);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(5000);
  }, 60_000);

  it('o XML enviado passa no schema oficial da SEFAZ (enviNFe 4.00); XML quebrado não passa', async () => {
    const cases = [
      order,
      { ...order, id: 'ord_card', items: [{ sku: 'p1_v1', productName: 'Lençol', quantity: 1, unitPrice: 15000, note: 'Fronha trocada: Floral' }], productsCents: 15000, shippingCents: 0, couponDiscountCents: 500, discountCents: 500, totalCents: 15400,
        address: { cep: '89010000', street: 'Rua XV', number: '1', complement: 'sala 2', neighborhood: 'Centro', city: 'Blumenau', state: 'SC' }, payment: { method: 'card' }, delivery: { carrier: 'pickup' } },
    ];
    const mod = await import('nfewizard-io') as unknown as { default: new () => { NFE_LoadEnvironment(a: unknown): Promise<void>; NFE_SchemaValidate(x: string, m: string): Promise<{ success: boolean }> } };
    const w = new mod.default();
    await w.NFE_LoadEnvironment({ config: { dfe: { pathCertificado: cert.pfx, senhaCertificado: cert.password, UF: 'SC', CPFCNPJ: CNPJ }, nfe: { ambiente: 2, versaoDF: '4.00' }, lib: { log: { exibirLogNoConsole: false, armazenarLogs: false }, useOpenSSL: false, useForSchemaValidation: 'validateSchemaJsBased' } } });
    for (const [i, o] of cases.entries()) {
      const { nfe, chave } = buildNfe(o, customer, config, { numero: 20 + i, serie: 1, cNF: '24681357', dhEmi: '2026-10-27T12:00:00-03:00', homologacao: i === 0, cMunDest: o.address.state === 'SP' ? '3550308' : '4202404' });
      reply = autorizada;
      await authorize('homologacao', cert, 'SC', CNPJ, nfe, chave);
      const enviNFe = requests.at(-1)!.body.match(/<enviNFe[\s\S]*<\/enviNFe>/)?.[0] ?? '';
      expect((await w.NFE_SchemaValidate(enviNFe, 'NFeAutorizacao')).success).toBe(true);
      // Sem um campo obrigatório: o validador recusa (lança).
      await expect(w.NFE_SchemaValidate(enviNFe.replace(/<natOp>[^<]*<\/natOp>/, ''), 'NFeAutorizacao')).rejects.toThrow(/inesperado|esperado/i);
    }
  }, 120_000);
});
