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
