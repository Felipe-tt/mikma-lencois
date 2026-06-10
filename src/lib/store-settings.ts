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
};
