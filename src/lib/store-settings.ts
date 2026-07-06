// Shared between server (settings.ts) and client (configuracoes/page.tsx)
// Must NOT be 'use client'

import { DEFAULT_BUSINESS_HOURS } from './business-hours';

export type StoreSettings = {
  storeName: string;
  storeSlogan: string;
  storeCity: string;
  storeState: string;
  storeAddress: string;
  storeNumber: string;
  storeComplement: string;
  storeNeighborhood: string;
  storeCep: string;
  storePhone: string;
  storeEmail: string;
  storeCnpj: string;
  instagramUrl: string;
  whatsappUrl: string;
  topbarText: string;
  heroSubtitle: string;
  aboutPara1: string;
  aboutPara2: string;
  aboutPara3: string;
  // Página Sobre — hero
  aboutHeroLine1: string;
  aboutHeroLine2: string;
  // Página Sobre — sidebar stats
  aboutStat1Label: string;
  aboutStat1Value: string;
  aboutStat2Label: string;
  aboutStat2Value: string;
  aboutStat3Label: string;
  aboutStat3Value: string;
  // Página Sobre — botão WhatsApp
  aboutWhatsappLabel: string;
  // Página Sobre — timeline (array JSON serializado)
  aboutTimelineTitle: string;
  aboutTimeline: string; // JSON: [{year, label, desc}]
  originLat: number;
  originLng: number;
  originCep: string;
  localDeliveryRadiusKm: number;
  // Toggle editável no painel — troca instantaneamente entre credenciais de
  // teste e produção do Uber Direct (env vars separadas), sem precisar de
  // novo deploy. Nunca guarda client_secret aqui — só a flag.
  uberDirectSandboxMode?: boolean;
  defaultItemWeightKg: number;
  dispatchCutoffTime: string;
  freeShippingThresholdCents: number;
  lowStockThreshold: number;
  // Horário de funcionamento (JSON serializado — ver src/lib/business-hours.ts)
  businessHours: string;
  businessHoursTimezone: string; // IANA, ex: "America/Sao_Paulo"
  // Payment
  creditMinOrderCents: number; // 0 = desabilitado; >0 = valor mínimo para habilitar cartão
  pixDiscountThresholdCents: number; // 0 = desabilitado; >0 = valor mínimo para aplicar desconto PIX
  pixDiscountPct: number; // percentual do desconto PIX (ex: 10 = 10%)
  foundedYear: string;
  // Hero
  heroLine1: string;
  heroLine2: string;
  heroLine3: string;
  heroTrust1: string;
  heroTrust2: string;
  heroTrust3: string;
  heroTrust4: string;
  // Seção escura (CTA final)
  ctaSloganLine1: string;
  ctaSloganLine2: string;
  ctaBtn1: string;
  ctaBtn2: string;
  // Homepage — título da grade de produtos
  featuredTitle: string;
  sizeGuideRows: string;
  sizeGuideColumns: string;
  sizeGuideNote: string;
  bedSizeRows: string;
  bedSizeColumns: string;
  productTrust1: string;
  productTrust2: string;
  productTrust3: string;
};

export const STORE_DEFAULTS: StoreSettings = {
  storeName: '',
  storeSlogan: '',
  storeCity: '',
  storeState: '',
  storeAddress: '',
  storeNumber: '',
  storeComplement: '',
  storeNeighborhood: '',
  storeCep: '',
  storePhone: '',
  storeEmail: '',
  storeCnpj: '',
  instagramUrl: '',
  whatsappUrl: '',
  topbarText: '',
  heroSubtitle: '',
  aboutPara1: '',
  aboutPara2: '',
  aboutPara3: '',
  aboutHeroLine1: '',
  aboutHeroLine2: '',
  aboutStat1Label: 'Localização',
  aboutStat1Value: '',
  aboutStat2Label: 'Entrega local',
  aboutStat2Value: 'Até 1 hora',
  aboutStat3Label: 'Cobertura',
  aboutStat3Value: 'Todo o Brasil',
  aboutWhatsappLabel: 'Falar no WhatsApp',
  aboutTimelineTitle: 'Nossa trajetória',
  aboutTimeline: JSON.stringify([
    { year: '2018', label: 'Fundação', desc: 'A Mikma nasce em Blumenau com o objetivo de levar qualidade têxtil direto da fábrica para as casas.' },
    { year: '2020', label: 'Entrega local', desc: 'Lançamos entrega em até 1h para toda Blumenau, sem custo adicional.' },
    { year: '2022', label: 'Brasil todo', desc: 'Expandimos com frete nacional via PAC, SEDEX e transportadoras com rastreio em tempo real.' },
    { year: '2024', label: 'Loja online', desc: 'Inauguramos nossa loja virtual. Compra fácil, pagamento via PIX, confirmação automática.' },
  ]),
  originLat: 0,
  originLng: 0,
  originCep: '',
  localDeliveryRadiusKm: 10,
  uberDirectSandboxMode: false,
  defaultItemWeightKg: 0.8,
  dispatchCutoffTime: '17:00',
  freeShippingThresholdCents: 0,
  lowStockThreshold: 3,
  businessHours: JSON.stringify(DEFAULT_BUSINESS_HOURS),
  businessHoursTimezone: 'America/Sao_Paulo',
  creditMinOrderCents: 0,
  pixDiscountThresholdCents: 180000, // R$ 1.800,00
  pixDiscountPct: 10,
  foundedYear: '2018',
  heroLine1: '',
  heroLine2: '',
  heroLine3: '',
  heroTrust1: '',
  heroTrust2: '',
  heroTrust3: '',
  heroTrust4: '',
  ctaSloganLine1: '',
  ctaSloganLine2: '',
  ctaBtn1: '',
  ctaBtn2: '',
  featuredTitle: 'Escolhas da semana',
  sizeGuideRows: JSON.stringify([
    { Tamanho: 'Solteiro', 'Lençol': '150×220 cm', Fronha: '50×70 cm', 'Capa duvet': '150×200 cm' },
    { Tamanho: 'Casal',   'Lençol': '180×220 cm', Fronha: '50×70 cm', 'Capa duvet': '180×200 cm' },
    { Tamanho: 'Queen',   'Lençol': '200×230 cm', Fronha: '50×70 cm', 'Capa duvet': '200×200 cm' },
    { Tamanho: 'King',    'Lençol': '220×240 cm', Fronha: '50×70 cm', 'Capa duvet': '220×200 cm' },
  ]),
  sizeGuideColumns: JSON.stringify(['Tamanho', 'Lençol', 'Fronha', 'Capa duvet']),
  sizeGuideNote: 'Medidas podem variar ±2 cm após lavagem. Recomendamos lavar antes do primeiro uso.',
  bedSizeColumns: JSON.stringify(['Tamanho', 'Cama', 'Comprimento', 'Largura']),
  bedSizeRows: JSON.stringify([
    { Tamanho: 'Solteiro',     Cama: '0,88m', Comprimento: '2,20m', Largura: '1,40m' },
    { Tamanho: 'Solteiro Plus', Cama: '1,00m', Comprimento: '2,20m', Largura: '1,50m' },
    { Tamanho: 'Casal',        Cama: '1,38m', Comprimento: '2,28m', Largura: '1,80m' },
    { Tamanho: 'Queen',        Cama: '1,58m', Comprimento: '2,28m', Largura: '2,10m' },
    { Tamanho: 'King',         Cama: '1,93m', Comprimento: '2,28m', Largura: '2,40m' },
  ]),
  productTrust1: 'Entrega local em Blumenau em até 1h',
  productTrust2: 'Frete para todo o Brasil com rastreio',
  productTrust3: 'Pagamento PIX com confirmação imediata',
};
