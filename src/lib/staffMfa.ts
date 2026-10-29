/**
 * Verificação em duas etapas da equipe (vendedor e admin).
 *
 * Vale como segundo fator, só nesta sessão (vem no próprio token de ID):
 * - login com senha ou Google + código do app autenticador (TOTP do
 *   Firebase Auth: firebase.sign_in_second_factor);
 * - login com passkey (token próprio com passkey: true, ver lib/passkeys.ts).
 */
export interface MfaClaims {
  passkey?: unknown;
  firebase?: { sign_in_provider?: string; sign_in_second_factor?: string };
}

export function hasSecondFactor(decoded: MfaClaims): boolean {
  if (decoded.firebase?.sign_in_second_factor) return true;
  return decoded.firebase?.sign_in_provider === 'custom' && decoded.passkey === true;
}

/**
 * Papel do token para checar permissão: equipe sem a segunda etapa nesta
 * sessão conta como sem papel. Toda rota que lê o papel direto do token
 * (em vez de verifyAuth) passa por aqui, senão quem tem só a senha de
 * alguém da equipe chamaria a API sem a passkey.
 */
export function effectiveRole(claims: MfaClaims & { role?: unknown }): string {
  const role = typeof claims.role === 'string' ? claims.role : '';
  if ((role === 'seller' || role === 'admin') && !hasSecondFactor(claims)) return '';
  return role;
}
