/**
 * Header Exposed-Credential-Check da Cloudflare (detecção de credenciais
 * vazadas, ligada em infra-manutencao.yml): 1 = e-mail e senha juntos,
 * 2 = par parecido, 4 = só a senha já apareceram em vazamento público.
 * 3 (só o e-mail) é comum demais para pesar.
 */
export function passwordLeaked(header: string | null): boolean {
  return header === '1' || header === '2' || header === '4';
}
