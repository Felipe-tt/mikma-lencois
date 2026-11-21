import emailSpellChecker, { POPULAR_DOMAINS, POPULAR_TLDS } from '@zootools/email-spell-checker';

/**
 * Erro de digitação no domínio do e-mail (gmial.com, hotmial.com, gmail.con).
 * Módulo à parte de ./signup para o checkout não carregar o resto da
 * validação do cadastro (telefone, CPF).
 */

const BR_DOMAINS = [
  'uol.com', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br', 'globo.com', 'r7.com',
  'live.com', 'msn.com', 'proton.me', 'protonmail.com', 'icloud.com', 'me.com',
];
const BR_TLDS = ['com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'br'];

/** Sugere correção de erro de digitação (gmial.com), ou null se estiver ok. */
export function suggestEmailFix(raw: string): string | null {
  const email = raw.normalize('NFKC').trim().toLowerCase();
  if (!email.includes('@')) return null;
  const hit = emailSpellChecker.run({
    email,
    domains: [...POPULAR_DOMAINS, ...BR_DOMAINS],
    topLevelDomains: [...POPULAR_TLDS, ...BR_TLDS],
  });
  return hit && hit.full !== email ? hit.full : null;
}
