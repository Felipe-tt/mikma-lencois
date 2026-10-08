import type { StoreSettings } from '@/lib/store-settings';

/**
 * Data da última atualização material dos documentos legais (AAAA-MM-DD).
 *
 * Ao visitante mostramos só o ano ("Última atualização: 2026"), como as
 * lojas em geral. A data completa fica guardada em
 * users/{uid}.lgpdConsent.version no cadastro, para provar a qual texto cada
 * cliente deu o aceite. Atualizar sempre que houver mudança relevante.
 */
export const LEGAL_UPDATED_AT = '2026-10-07';
export const LEGAL_VERSION = LEGAL_UPDATED_AT;
export const LEGAL_UPDATED_LABEL = LEGAL_UPDATED_AT.slice(0, 4);

/** Documentos que aparecem no menu lateral das páginas legais. */
export const LEGAL_PAGES = [
  { href: '/termos', label: 'Termos e Condições de Uso' },
  { href: '/privacidade', label: 'Política de Privacidade' },
  { href: '/politica-de-cookies', label: 'Política de Cookies' },
  { href: '/trocas-e-devolucoes', label: 'Trocas e Devoluções' },
] as const;

export type StoreIdentity = {
  name: string;
  cnpj: string;
  cityState: string;
  /** Endereço completo; vazio se a loja ainda não preencheu no painel. */
  address: string;
  email: string;
  phone: string;
  whatsappUrl: string;
};

/** Dados de identificação do fornecedor (Decreto 7.962/2013), vindos do painel. */
export function storeIdentity(s: StoreSettings): StoreIdentity {
  const city = s.storeCity?.trim() ?? '';
  const state = s.storeState?.trim() ?? '';
  const cityState = city ? (state ? `${city}/${state}` : city) : 'Blumenau/SC';

  const street = [s.storeAddress, s.storeNumber].map(v => v?.trim()).filter(Boolean).join(', ');
  const address = street
    ? [
        [street, s.storeComplement?.trim()].filter(Boolean).join(', '),
        s.storeNeighborhood?.trim(),
        cityState,
        s.storeCep?.trim() ? `CEP ${s.storeCep.trim()}` : '',
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return {
    name: s.storeName?.trim() || 'Mikma Lençóis',
    cnpj: s.storeCnpj?.trim() ?? '',
    cityState,
    address,
    email: s.storeEmail?.trim() ?? '',
    phone: s.storePhone?.trim() ?? '',
    whatsappUrl: s.whatsappUrl?.trim() ?? '',
  };
}
