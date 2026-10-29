/**
 * Origens de onde o site aceita carregar script. Usada no script-src da CSP
 * (src/proxy.ts) e na política de Trusted Types (TrustedTypesScript), para
 * as duas listas nunca divergirem.
 */
export const SCRIPT_ORIGINS = [
  'https://apis.google.com',
  'https://www.gstatic.com',
  'https://www.google.com',
  'https://www.recaptcha.net',
  'https://accounts.google.com',
  'https://www.googletagmanager.com',
  'https://connect.facebook.net',
  'https://abacatepay.com',
  'https://challenges.cloudflare.com',
] as const;

/** Checkout: o cartão da AbacatePay carrega scripts de domínios que ela não publica. */
export const isCheckoutPath = (pathname: string) => pathname === '/checkout' || pathname.startsWith('/checkout/');
