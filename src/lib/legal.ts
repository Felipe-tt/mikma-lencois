import type { StoreSettings } from '@/lib/store-settings';

/**
 * Versão vigente dos Termos de Uso e da Política de Privacidade.
 *
 * É gravada em users/{uid}.lgpdConsent.version no cadastro, para provar a
 * qual texto cada cliente deu o aceite. Incrementar sempre que houver
 * mudança material nos dois documentos e atualizar LEGAL_UPDATED_LABEL.
 */
export const LEGAL_VERSION = '2.1';
export const LEGAL_UPDATED_LABEL = '7 de outubro de 2026';

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
