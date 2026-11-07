/**
 * Links do perfil da empresa no Google (avaliação e Maps), preenchidos nas
 * Configurações. Só passam links https de domínios do Google: o link vai em
 * e-mail para clientes e nos dados da loja, então nada de endereço qualquer.
 */
const GOOGLE_HOSTS = /^(?:[a-z0-9-]+\.)*(?:google\.com(?:\.[a-z]{2})?|google\.[a-z]{2}|g\.page|goo\.gl)$/i;

export function isGoogleUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' && GOOGLE_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

/** O link, se for do Google; senão, vazio. */
export function googleUrl(raw: string | null | undefined): string {
  return isGoogleUrl(raw) ? raw!.trim() : '';
}
