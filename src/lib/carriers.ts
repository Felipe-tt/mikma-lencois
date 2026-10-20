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
    // não um código postal, passamos ela diretamente
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
  // Serviço do Melhor Envio sem nome próprio ("melhor_envio_17"): não mostra o código.
  return CARRIERS[carrier]?.name ?? 'Transportadora';
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

/** True se é Jadlog (Package ou Expresso). */
export function isJadlog(carrier: CarrierKey): boolean {
  return carrier === 'jadlog_package' || carrier === 'jadlog_expresso';
}

/**
 * True se o despacho é manual: o lojista posta na agência e informa o
 * código de rastreio no painel (Correios e Jadlog, sem compra de etiqueta).
 */
export function isManualDispatch(carrier: CarrierKey): boolean {
  return isCorreios(carrier) || isJadlog(carrier);
}

/**
 * Validação leve do código digitado no painel: Correios tem formato fixo
 * (AA123456789BR); Jadlog varia (número do pedido/CT-e), então só exige
 * algo plausível (6 a 30 caracteres alfanuméricos).
 */
export function isValidTrackingCodeFor(carrier: CarrierKey, code: string): boolean {
  const clean = normalizeTrackingCode(code);
  if (isCorreios(carrier)) return isCorreiosTrackingCode(clean);
  return clean.length >= 6 && clean.length <= 30;
}

/**
 * Normaliza um código de rastreio pra maiúsculas, sem espaço/traço/pontuação.
 * O vendedor pode colar o código de qualquer jeito (com espaço no meio,
 * minúsculo, com traço), então tudo que compara/detecta o formato tem que
 * usar essa mesma normalização, ou um código "sujo" escapa da detecção e
 * cai no fluxo errado (era exatamente o bug do rastreio de SEDEX travado).
 */
export function normalizeTrackingCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** True se o código (já normalizado ou não) está no formato dos Correios: AA123456789BR */
export function isCorreiosTrackingCode(code: string): boolean {
  return /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(normalizeTrackingCode(code));
}

const COURIER_VEHICLE: Record<string, string> = {
  car: 'Carro', motorcycle: 'Moto', scooter: 'Moto', bicycle: 'Bicicleta', walker: 'A pé', van: 'Van', truck: 'Caminhão',
};

/** Veículo do entregador da Uber (vehicle_type) em português. */
export function courierVehicleLabel(vehicle: string): string {
  return COURIER_VEHICLE[vehicle.toLowerCase()] ?? vehicle;
}

// Cor do carro como a Uber manda (em inglês, às vezes em português).
const CAR_COLORS: [RegExp, string, string][] = [
  [/white|branc/i, 'Branco', '#F4F4F2'],
  [/black|pret/i, 'Preto', '#222222'],
  [/silver|prata/i, 'Prata', '#C3C7CC'],
  [/gr[ae]y|cinza|grafite/i, 'Cinza', '#7E848C'],
  [/red|vermelh/i, 'Vermelho', '#C0392B'],
  [/blue|azul/i, 'Azul', '#2456A6'],
  [/green|verde/i, 'Verde', '#2E7D4F'],
  [/yellow|amarel/i, 'Amarelo', '#E8C33A'],
  [/orange|laranja/i, 'Laranja', '#E07B2E'],
  [/brown|marrom/i, 'Marrom', '#6B4A3A'],
  [/beige|bege/i, 'Bege', '#D9C9A8'],
  [/gold|dourad/i, 'Dourado', '#C8A44D'],
  [/purple|roxo/i, 'Roxo', '#6B45A0'],
  [/wine|vinho|burgundy|maroon/i, 'Vinho', '#7A2635'],
];

/** Nome em português e tom do desenho do carro a partir da cor da Uber. */
export function courierCarColor(color?: string | null): { label: string; hex: string } | null {
  if (!color) return null;
  const hit = CAR_COLORS.find(([re]) => re.test(color));
  return hit ? { label: hit[1], hex: hit[2] } : { label: color, hex: '#C3C7CC' };
}
