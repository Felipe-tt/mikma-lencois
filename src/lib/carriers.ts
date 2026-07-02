// Carriers conhecidos do sistema
export type CarrierKey =
  | 'correios_pac'
  | 'correios_sedex'
  | 'jadlog_package'
  | 'jadlog_expresso'
  | 'uber_direct'
  | 'disk_tenha'
  | 'total_express'
  | 'pickup'
  | 'manual'
  | (string & {});

interface CarrierInfo {
  name: string;           // Nome legível pro cliente
  nameVendor?: string;    // Nome mais técnico pro vendor (se diferente)
  trackingUrl: (code: string) => string | null;
}

const CARRIERS: Record<string, CarrierInfo> = {
  correios_pac: {
    name: 'Correios PAC',
    trackingUrl: code => `https://rastreamento.correios.com.br/app/index.php?objetos=${code}`,
  },
  correios_sedex: {
    name: 'Correios SEDEX',
    trackingUrl: code => `https://rastreamento.correios.com.br/app/index.php?objetos=${code}`,
  },
  jadlog_package: {
    name: 'Jadlog Package',
    trackingUrl: code => `https://www.jadlog.com.br/siteInstitucional/tracking.jad?cte=${code}`,
  },
  jadlog_expresso: {
    name: 'Jadlog Expresso',
    trackingUrl: code => `https://www.jadlog.com.br/siteInstitucional/tracking.jad?cte=${code}`,
  },
  total_express: {
    name: 'Total Express',
    trackingUrl: code => `https://totalexpress.com.br/rastreio?codigo=${code}`,
  },
  uber_direct: {
    name: 'Entrega expressa',
    nameVendor: 'Uber Direct',
    // Para Uber Direct, o code é a URL real de rastreio em tempo real (tracking_url da API)
    // não um código postal — passamos ela diretamente
    trackingUrl: code => code?.startsWith('http') ? code : null,
  },
  disk_tenha: {
    name: 'Disk Tenha',
    trackingUrl: () => null,
  },
  pickup: {
    name: 'Retirada na loja',
    trackingUrl: () => null,
  },
  manual: {
    name: 'Entrega própria',
    trackingUrl: () => null,
  },
};

/** Nome legível da transportadora para o cliente */
export function carrierName(carrier: CarrierKey): string {
  return CARRIERS[carrier]?.name ?? carrier.replace(/_/g, ' ');
}

/** Nome técnico da transportadora para o vendor (pode ser mais detalhado) */
export function carrierNameVendor(carrier: CarrierKey): string {
  const info = CARRIERS[carrier];
  return info?.nameVendor ?? info?.name ?? carrier.replace(/_/g, ' ');
}

/** URL de rastreio para o código dado. Retorna null se não houver. */
export function trackingUrl(carrier: CarrierKey, code: string): string | null {
  if (!code) return null;
  return CARRIERS[carrier]?.trackingUrl(code) ?? null;
}

/** True se a transportadora usa Correios por baixo (para exibir o TrackingTimeline da API Link&Track) */
export function isCorreios(carrier: CarrierKey): boolean {
  return carrier === 'correios_pac' || carrier === 'correios_sedex';
}
