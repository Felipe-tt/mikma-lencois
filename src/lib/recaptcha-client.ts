'use client';

/**
 * Helper client-side do reCAPTCHA v3.
 *
 * Carrega o script sob demanda (só quando alguém realmente vai gerar um
 * token, não no bundle inicial de toda página) e expõe uma função simples
 * pra pegar o token de uma ação específica.
 *
 * Se NEXT_PUBLIC_RECAPTCHA_SITE_KEY não estiver configurada neste
 * ambiente, retorna undefined silenciosamente — o backend
 * (verifyRecaptcha em src/lib/recaptcha.ts) trata token ausente como
 * "não bloqueia" (fail-open), então build/dev sem reCAPTCHA configurado
 * continuam funcionando normalmente.
 */

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(siteKey: string): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.grecaptcha) return resolve();
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar reCAPTCHA'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Retorna um token de reCAPTCHA v3 para a ação informada, ou undefined
 *  se a site key não estiver configurada ou o carregamento falhar. */
export async function getRecaptchaToken(action: string): Promise<string | undefined> {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey) return undefined;

  try {
    await loadScript(siteKey);
    return await new Promise<string>((resolve, reject) => {
      window.grecaptcha!.ready(() => {
        window.grecaptcha!.execute(siteKey, { action }).then(resolve).catch(reject);
      });
    });
  } catch {
    return undefined; // não bloqueia o fluxo — backend trata token ausente como fail-open
  }
}
