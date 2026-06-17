// Shared between server (settings.ts) and client (configuracoes/page.tsx)
// Must NOT be 'use client'

export type StoreSettings = {
  storeName: string;
  storeSlogan: string;
  storeCity: string;
  storeState: string;
  storeAddress: string;
  storeNeighborhood: string;
  storeCep: string;
  storePhone: string;
  storeEmail: string;
  instagramUrl: string;
  whatsappUrl: string;
  topbarText: string;
  heroTitle: string;
  heroSubtitle: string;
  heroTag: string;
  heroFloatTag1Label: string;
  heroFloatTag1Value: string;
  heroFloatTag2Label: string;
  heroFloatTag2Value: string;
  feat1Title: string; feat1Sub: string;
  feat2Title: string; feat2Sub: string;
  feat3Title: string; feat3Sub: string;
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
  // Página Sobre — timeline
  aboutTimelineTitle: string;
  aboutTimeline1Year: string;
  aboutTimeline1Label: string;
  aboutTimeline1Desc: string;
  aboutTimeline2Year: string;
  aboutTimeline2Label: string;
  aboutTimeline2Desc: string;
  aboutTimeline3Year: string;
  aboutTimeline3Label: string;
  aboutTimeline3Desc: string;
  aboutTimeline4Year: string;
  aboutTimeline4Label: string;
  aboutTimeline4Desc: string;
  originLat: number;
  originLng: number;
  originCep: string;
  localDeliveryRadiusKm: number;
  defaultItemWeightKg: number;
  dispatchCutoffTime: string;
  freeShippingThresholdCents: number;
  lowStockThreshold: number;
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
  // Homepage stats
  featuredTitle: string;
  statOrders: string;
  statRating: string;
  statDelivery: string;
  statYears: string;
};

export const STORE_DEFAULTS: StoreSettings = {
  storeName: '',
  storeSlogan: '',
  storeCity: '',
  storeState: '',
  storeAddress: '',
  storeNeighborhood: '',
  storeCep: '',
  storePhone: '',
  storeEmail: '',
  instagramUrl: '',
  whatsappUrl: '',
  topbarText: '',
  heroTitle: '',
  heroSubtitle: '',
  heroTag: '',
  heroFloatTag1Label: '',
  heroFloatTag1Value: '',
  heroFloatTag2Label: '',
  heroFloatTag2Value: '',
  feat1Title: '', feat1Sub: '',
  feat2Title: '', feat2Sub: '',
  feat3Title: '', feat3Sub: '',
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
  aboutTimeline1Year: '2018',
  aboutTimeline1Label: 'Fundação',
  aboutTimeline1Desc: 'A Mikma nasce em Blumenau com o objetivo de levar qualidade têxtil direto da fábrica para as casas.',
  aboutTimeline2Year: '2020',
  aboutTimeline2Label: 'Entrega local',
  aboutTimeline2Desc: 'Lançamos entrega em até 1h para toda Blumenau, sem custo adicional.',
  aboutTimeline3Year: '2022',
  aboutTimeline3Label: 'Brasil todo',
  aboutTimeline3Desc: 'Expandimos com frete nacional via PAC, SEDEX e transportadoras com rastreio em tempo real.',
  aboutTimeline4Year: '2024',
  aboutTimeline4Label: 'Loja online',
  aboutTimeline4Desc: 'Inauguramos nossa loja virtual. Compra fácil, pagamento via PIX, confirmação automática.',
  originLat: 0,
  originLng: 0,
  originCep: '',
  localDeliveryRadiusKm: 10,
  defaultItemWeightKg: 0.8,
  dispatchCutoffTime: '17:00',
  freeShippingThresholdCents: 0,
  lowStockThreshold: 3,
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
  statOrders: '1.200+',
  statRating: '4.9',
  statDelivery: '< 1h',
  statYears: '6 anos',
};
