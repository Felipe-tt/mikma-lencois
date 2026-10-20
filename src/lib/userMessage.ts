/**
 * Texto de erro que pode ir pro cliente.
 *
 * Os catch das páginas mostravam err.message direto: falha de rede virava
 * "Failed to fetch", resposta HTML de erro virava "Unexpected token '<'…"
 * e erro do Firebase/API aparecia em inglês. Aqui só passa mensagem que
 * parece escrita pra pessoa; o resto vira um texto genérico em português.
 */

const NETWORK = /failed to fetch|load failed|networkerror|network request failed|network-request-failed|err_network|timeout|aborted/i;
const TECHNICAL = /unexpected token|json|is not valid|undefined|null|typeerror|referenceerror|syntaxerror|cannot read|firebase|auth\/|permission[-_ ]denied|unauthorized|forbidden|invalid token|internal|provider|gateway|status \d{3}|\b[45]\d\d\b|^error\b|exception|stack|erro interno|^erro\.?$|[a-z]+_[a-z_]+/i;

export function userMessage(err: unknown, fallback = 'Não foi possível concluir agora. Tente de novo.'): string {
  const msg = (err instanceof Error ? err.message : typeof err === 'string' ? err : '').trim();
  if (!msg) return fallback;
  if (NETWORK.test(msg)) return 'Erro de conexão. Verifique sua internet e tente de novo.';
  if (TECHNICAL.test(msg) || msg.length > 220) return fallback;
  return msg;
}
