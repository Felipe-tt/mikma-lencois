'use client';

/**
 * Prova de humano no navegador, sob demanda (só quando alguém vai mandar
 * um formulário, não no bundle inicial de toda página).
 *
 * Cloudflare Turnstile (NEXT_PUBLIC_TURNSTILE_SITE_KEY) é o padrão: grátis,
 * sem limite e quase sempre invisível. O widget só aparece, num canto da
 * tela, se a Cloudflare precisar de uma interação. Sem a chave do
 * Turnstile, cai no reCAPTCHA v3 (NEXT_PUBLIC_RECAPTCHA_SITE_KEY).
 *
 * Sem chave nenhuma, retorna undefined e o backend decide (ver
 * src/lib/recaptcha.ts): build/dev sem CAPTCHA continuam funcionando.
 */

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      execute: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const scripts = new Map<string, Promise<void>>();

function loadScript(src: string, ready: () => boolean): Promise<void> {
  const cached = scripts.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    if (ready()) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scripts.delete(src); reject(new Error('Falha ao carregar a verificação')); };
    document.head.appendChild(script);
  });
  scripts.set(src, p);
  return p;
}

const TURNSTILE_TIMEOUT_MS = 60_000;

async function turnstileToken(siteKey: string, action: string): Promise<string> {
  await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', () => !!window.turnstile);
  const ts = window.turnstile!;
  // Canto de baixo, por cima de tudo: só aparece se precisar de um clique.
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647';
  document.body.appendChild(box);
  let id = '';
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Verificação expirou')), TURNSTILE_TIMEOUT_MS);
      id = ts.render(box, {
        sitekey: siteKey,
        // Ação só aceita letras, números, - e _.
        action: action.replace(/[^\w-]/g, '_').slice(0, 32),
        execution: 'execute',
        appearance: 'interaction-only',
        language: 'pt-br',
        callback: (token: string) => { clearTimeout(timer); resolve(token); },
        'error-callback': () => { clearTimeout(timer); reject(new Error('Verificação falhou')); },
      });
      ts.execute(id);
    });
  } finally {
    if (id) try { ts.remove(id); } catch { /* já removido */ }
    box.remove();
  }
}

async function recaptchaToken(siteKey: string, action: string): Promise<string> {
  await loadScript(`https://www.google.com/recaptcha/api.js?render=${siteKey}`, () => !!window.grecaptcha);
  return new Promise<string>((resolve, reject) => {
    window.grecaptcha!.ready(() => {
      window.grecaptcha!.execute(siteKey, { action }).then(resolve).catch(reject);
    });
  });
}

/** Token da verificação de humano para a ação informada, ou undefined
 *  se não houver chave configurada ou o carregamento falhar. */
export async function getRecaptchaToken(action: string): Promise<string | undefined> {
  const turnstileKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  try {
    if (turnstileKey) return await turnstileToken(turnstileKey, action);
    if (recaptchaKey) return await recaptchaToken(recaptchaKey, action);
  } catch {
    // o backend decide: bloqueia/desafia quando a verificação está configurada
  }
  return undefined;
}
