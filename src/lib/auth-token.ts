import { randomBytes } from 'crypto';

/**
 * Gera um token de uso único, longo e imprevisível, para verificação por
 * link (clique no botão do e-mail) em vez de código digitado manualmente.
 *
 * 32 bytes = 256 bits de entropia, codificado em base64url (sem +, /, =,
 * seguro para ir direto numa querystring sem escaping extra).
 */
export function generateActionToken(): string {
  return randomBytes(32).toString('base64url');
}
