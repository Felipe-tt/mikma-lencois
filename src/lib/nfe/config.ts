/**
 * Configuração fiscal da NF-e, editável no painel (settings/store). Os
 * padrões são os de uma ME/EPP do Simples Nacional vendendo roupa de cama de
 * malha para consumidor final pela internet. Confirme com a contabilidade.
 */
export type NfeEnvironment = 'producao' | 'homologacao';

export interface NfeConfig {
  autoEmit: boolean;
  environment: NfeEnvironment;
  cnpj: string;
  ufEmitente: string;
  ncm: string;
  csosn: string;
  pisCofinsCst: string;
  origem: string;
  cfopInterno: string;
  cfopInterestadual: string;
  naturezaOperacao: string;
  infoAdicional: string;
}

export const NFE_DEFAULTS: NfeConfig = {
  autoEmit: false,
  environment: 'homologacao',
  cnpj: '29966649000143',
  ufEmitente: 'SC',
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

type SettingsLike = Partial<Record<`nfe${string}`, unknown>>;

const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

/** Lê a configuração das settings, caindo no padrão campo a campo. */
export function nfeConfigFrom(settings: SettingsLike): NfeConfig {
  const d = NFE_DEFAULTS;
  return {
    autoEmit: settings.nfeAutoEmit === true,
    environment: settings.nfeEnvironment === 'producao' ? 'producao' : 'homologacao',
    cnpj: str(settings.nfeCnpj, d.cnpj).replace(/\D/g, ''),
    ufEmitente: str(settings.nfeUfEmitente, d.ufEmitente).toUpperCase(),
    ncm: str(settings.nfeNcm, d.ncm).replace(/\D/g, ''),
    csosn: str(settings.nfeCsosn, d.csosn),
    pisCofinsCst: str(settings.nfePisCofinsCst, d.pisCofinsCst),
    origem: str(settings.nfeOrigem, d.origem),
    cfopInterno: str(settings.nfeCfopInterno, d.cfopInterno),
    cfopInterestadual: str(settings.nfeCfopInterestadual, d.cfopInterestadual),
    naturezaOperacao: str(settings.nfeNaturezaOperacao, d.naturezaOperacao),
    infoAdicional: str(settings.nfeInfoAdicional, d.infoAdicional),
  };
}
