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
  storeName: 'Mikma Lençóis',
  storeSlogan: 'Tecido que dura, conforto que fica.',
  storeCity: 'Blumenau, SC',
  storeState: 'SC',
  storeAddress: '',
  storeNeighborhood: 'Garcia',
  storeCep: '',
  storePhone: '',
  storeEmail: '',
  topbarText: 'Entrega local Blumenau em 1h · PIX com confirmação automática',
  heroTitle: 'Lençóis\nfeitos pra\ndurar.',
  heroSubtitle: 'Qualidade direto da fábrica. Entrega em até 1h em Blumenau ou para todo o Brasil.',
  heroTag: 'Blumenau, SC — Coleção',
  heroFloatTag1Label: '400 fios',
  heroFloatTag1Value: '100% Algodão',
  heroFloatTag2Label: 'Entrega',
  heroFloatTag2Value: 'Em 1h · Blumenau',
  feat1Title: 'Entrega em 1h', feat1Sub: 'Para endereços em Blumenau via Uber Direct.',
  feat2Title: 'Frete nacional', feat2Sub: 'PAC, SEDEX e transportadoras com rastreio em tempo real.',
  feat3Title: 'Pague com PIX', feat3Sub: 'Confirmação automática e instantânea.',
  aboutPara1: 'A Mikma Lençóis nasceu em Blumenau, SC, com o objetivo de oferecer produtos de cama, mesa e banho com qualidade superior, acessíveis e entregues com agilidade.',
  aboutPara2: 'Operamos com entrega local em até 1 hora via Uber Direct para endereços em Blumenau, e também enviamos para todo o Brasil com rastreamento em tempo real.',
  aboutPara3: 'Todos os pagamentos são processados via PIX com confirmação automática, garantindo praticidade para você.',
  originLat: 0,
  originLng: 0,
  originCep: '',
  localDeliveryRadiusKm: 10,
  defaultItemWeightKg: 0.8,
  dispatchCutoffTime: '17:00',
  freeShippingThresholdCents: 0,
  lowStockThreshold: 3,
};
