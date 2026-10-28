/**
 * Configuração fiscal da NF-e, editável no painel (settings/store). Os
 * padrões são os de uma ME/EPP do Simples Nacional de SC vendendo roupa de
 * cama de malha para consumidor final pela internet. Confirme com a
 * contabilidade. O endereço do emitente vem dos dados da loja.
 */
export type NfeEnvironment = 'producao' | 'homologacao';

export interface NfeConfig {
  autoEmit: boolean;
  environment: NfeEnvironment;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  ie: string;
  crt: number; // 1 = Simples Nacional, 4 = MEI, 3 = regime normal
  serie: number;
  proximoNumero: number;
  ufEmitente: string;
  codMunicipio: string; // IBGE do município do emitente
  municipio: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  telefone: string;
  email: string;
  ncm: string;
  csosn: string;
  pisCofinsCst: string;
  origem: string;
  cfopInterno: string;
  cfopInterestadual: string;
  naturezaOperacao: string;
  infoAdicional: string;
}

export const NFE_DEFAULTS = {
  autoEmit: false,
  environment: 'homologacao' as NfeEnvironment,
  cnpj: '29966649000143',
  crt: 1,
  serie: 1,
  proximoNumero: 1,
  ufEmitente: 'SC',
  // Blumenau (SC).
  codMunicipio: '4202404',
  // 6302.10.00: roupas de cama de malha.
  ncm: '63021000',
  // Simples Nacional sem permissão de crédito.
  csosn: '102',
  pisCofinsCst: '49',
  origem: '0',
  cfopInterno: '5102',
  cfopInterestadual: '6102',
  naturezaOperacao: 'Venda de mercadoria',
  infoAdicional: 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.',
};

type SettingsLike = Record<string, unknown>;

const str = (v: unknown, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
const int = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Lê a configuração das settings, caindo no padrão campo a campo. */
export function nfeConfigFrom(s: SettingsLike): NfeConfig {
  const d = NFE_DEFAULTS;
  return {
    autoEmit: s.nfeAutoEmit === true,
    environment: s.nfeEnvironment === 'producao' ? 'producao' : 'homologacao',
    cnpj: str(s.nfeCnpj, str(s.storeCnpj, d.cnpj)).replace(/\D/g, ''),
    razaoSocial: str(s.nfeRazaoSocial, str(s.storeName)),
    nomeFantasia: str(s.storeName),
    ie: str(s.nfeIe).replace(/\D/g, ''),
    crt: int(s.nfeCrt, d.crt),
    serie: int(s.nfeSerie, d.serie),
    proximoNumero: int(s.nfeProximoNumero, d.proximoNumero),
    ufEmitente: str(s.storeState, d.ufEmitente).toUpperCase(),
    codMunicipio: str(s.nfeCodMunicipio, d.codMunicipio).replace(/\D/g, ''),
    municipio: str(s.storeCity, 'Blumenau'),
    logradouro: str(s.storeAddress),
    numero: str(s.storeNumber, 'S/N'),
    complemento: str(s.storeComplement),
    bairro: str(s.storeNeighborhood),
    cep: str(s.storeCep).replace(/\D/g, ''),
    telefone: str(s.storePhone).replace(/\D/g, ''),
    email: str(s.storeEmail),
    ncm: str(s.nfeNcm, d.ncm).replace(/\D/g, ''),
    csosn: str(s.nfeCsosn, d.csosn),
    pisCofinsCst: str(s.nfePisCofinsCst, d.pisCofinsCst),
    origem: str(s.nfeOrigem, d.origem),
    cfopInterno: str(s.nfeCfopInterno, d.cfopInterno),
    cfopInterestadual: str(s.nfeCfopInterestadual, d.cfopInterestadual),
    naturezaOperacao: str(s.nfeNaturezaOperacao, d.naturezaOperacao),
    infoAdicional: str(s.nfeInfoAdicional, d.infoAdicional),
  };
}
