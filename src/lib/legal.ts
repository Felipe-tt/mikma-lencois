import type { StoreSettings } from '@/lib/store-settings';

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** '2026-10-07' -> '7 de outubro de 2026' (sem Date, pra não variar com fuso). */
export function formatLegalDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

/**
 * Data da última atualização material dos Termos de Uso e da Política de
 * Privacidade (AAAA-MM-DD). É a única coisa mostrada ao visitante
 * ("Última atualização: ..."). Atualizar sempre que houver mudança
 * relevante nos textos.
 */
export const LEGAL_UPDATED_AT = '2026-10-07';
export const LEGAL_UPDATED_LABEL = formatLegalDate(LEGAL_UPDATED_AT);

/**
 * Identificador interno do texto aceito, gravado em
 * users/{uid}.lgpdConsent.version no cadastro para provar a qual versão
 * cada cliente deu o aceite. Não é exibido no site.
 */
export const LEGAL_VERSION = LEGAL_UPDATED_AT;

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
