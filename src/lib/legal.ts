import type { StoreSettings } from '@/lib/store-settings';
import { storeWhatsapp } from '@/lib/whatsapp';

/**
 * Data da última atualização material dos documentos legais (AAAA-MM-DD).
 *
 * Ao visitante mostramos a data por extenso ("7 de outubro de 2026"); só o
 * ano parecia texto esquecido. A mesma data fica guardada em
 * users/{uid}.lgpdConsent.version no cadastro, para provar a qual texto cada
 * cliente deu o aceite. Atualizar sempre que houver mudança relevante.
 */
export const LEGAL_UPDATED_AT = '2026-11-22';
export const LEGAL_VERSION = LEGAL_UPDATED_AT;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
// Montado à mão a partir da string: new Date('2026-10-07') é meia-noite UTC
// e no fuso do Brasil viraria 6 de outubro.
export const LEGAL_UPDATED_LABEL = (() => {
  const [y, m, d] = LEGAL_UPDATED_AT.split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
})();

/** Documentos que aparecem no menu lateral das páginas legais. */
export const LEGAL_PAGES = [
  { href: '/termos', label: 'Termos de Uso' },
  { href: '/privacidade', label: 'Política de Privacidade' },
  { href: '/politica-de-cookies', label: 'Política de Cookies' },
  { href: '/trocas-e-devolucoes', label: 'Trocas e Devoluções' },
] as const;

export type StoreIdentity = {
  name: string;
  /** Razão social (nome empresarial), quando diferente do nome da loja. */
  legalName: string;
  cnpj: string;
  cityState: string;
  /** Endereço completo; vazio se a loja ainda não preencheu no painel. */
  address: string;
  email: string;
  phone: string;
  whatsappUrl: string;
};

/** 14 dígitos viram 00.000.000/0000-00; outro formato fica como veio. */
function formatCnpj(v: string): string {
  const d = v.replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : v;
}

/**
 * Dados de identificação do fornecedor (Decreto 7.962/2013, art. 2º: nome
 * empresarial, CNPJ, endereço físico e eletrônico), vindos do painel. A
 * razão social e o CNPJ da nota fiscal completam o que faltar nos dados da
 * loja: antes, com o CNPJ só na aba de nota fiscal, o rodapé saía sem ele.
 */
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

  const name = s.storeName?.trim() || 'Mikma Lençóis';
  const razao = s.nfeRazaoSocial?.trim() ?? '';
  const cnpj = s.storeCnpj?.trim() || s.nfeCnpj?.trim() || '';
  return {
    name,
    legalName: razao && razao.toLocaleLowerCase('pt-BR') !== name.toLocaleLowerCase('pt-BR') ? razao : '',
    cnpj: cnpj ? formatCnpj(cnpj) : '',
    cityState,
    address,
    email: s.storeEmail?.trim() ?? '',
    phone: s.storePhone?.trim() ?? '',
    // Pelo link colado ou pelo telefone (com o 55); link que não é do WhatsApp não entra.
    whatsappUrl: storeWhatsapp(s) ?? '',
  };
}
