/**
 * Ticket que a checagem do site deu a este navegador (ver
 * lib/auth/loginTicket.ts): login conferido, cadastro, senha nova ou o id
 * do desafio por e-mail. Fica só nesta aba (sessionStorage) até o
 * AuthContext trocar por "este login é confiável".
 */
const KEY = 'mikma-login-ticket';

export function rememberLoginTicket(ticket: unknown): void {
  if (typeof ticket !== 'string' || !ticket) return;
  try { sessionStorage.setItem(KEY, ticket); } catch { /* sem storage: o login segue sem o ticket */ }
}

export function readLoginTicket(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function forgetLoginTicket(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* sem storage */ }
}
