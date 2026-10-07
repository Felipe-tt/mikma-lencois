import { useSyncExternalStore } from 'react';
import { GA_ID, META_PIXEL_ID } from '@/lib/analytics';

/**
 * Consentimento para cookies NÃO essenciais (medição de audiência: Google
 * Analytics e Meta Pixel). Os essenciais (sessão, tema, reCAPTCHA) não
 * dependem de escolha e não passam por aqui.
 *
 * Os scripts de medição só são carregados quando o status é 'granted'
 * (ver components/Analytics.tsx). Sem escolha ('unset') ou com recusa
 * ('denied'), nada de terceiros é carregado.
 */
export type ConsentStatus = 'granted' | 'denied' | 'unset';

export const CONSENT_KEY = 'mikma-cookie-consent';
/** Subir só quando as categorias de cookies mudarem (força nova pergunta). */
export const CONSENT_VERSION = 1;
/** A escolha vale 12 meses; depois perguntamos de novo. */
export const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const CONSENT_EVENT = 'mikma:cookie-consent';
export const OPEN_PREFERENCES_EVENT = 'mikma:cookie-preferences';

/** Sem GA nem Pixel configurados, não há nada opcional a consentir. */
export const HAS_OPTIONAL_COOKIES = Boolean(GA_ID || META_PIXEL_ID);

type Stored = { v: number; analytics: boolean; at: number };

/** Interpreta o valor salvo. Qualquer coisa inválida ou vencida vira 'unset'. */
export function parseConsent(raw: string | null, now: number = Date.now()): ConsentStatus {
  if (!raw) return 'unset';
  try {
    const d = JSON.parse(raw) as Partial<Stored>;
    if (d.v !== CONSENT_VERSION) return 'unset';
    if (typeof d.analytics !== 'boolean' || typeof d.at !== 'number') return 'unset';
    if (now - d.at > CONSENT_TTL_MS) return 'unset';
    if (d.at > now + 60_000) return 'unset'; // data no futuro: relógio errado ou valor adulterado
    return d.analytics ? 'granted' : 'denied';
  } catch {
    return 'unset';
  }
}

/**
 * Domínios onde um cookie de analytics pode ter sido gravado, do mais
 * específico ao mais amplo (ex.: www.mikma.com.br -> .www.mikma.com.br,
 * .mikma.com.br, .com.br). Usado para apagar _ga/_fbp ao revogar.
 */
export function trackingCookieDomains(hostname: string): string[] {
  if (!hostname || hostname === 'localhost' || /^[\d.]+$/.test(hostname) || hostname.includes(':')) {
    return [];
  }
  const parts = hostname.split('.');
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    out.push('.' + parts.slice(i).join('.'));
  }
  return out;
}

// Fallback em memória: se o localStorage estiver bloqueado (modo privado
// restrito), a escolha ainda vale até recarregar, e o banner não reaparece
// logo após o clique.
let memoryStatus: ConsentStatus | null = null;

export function readConsent(): ConsentStatus {
  try {
    const fromStorage = parseConsent(localStorage.getItem(CONSENT_KEY));
    if (fromStorage !== 'unset') return fromStorage;
  } catch {
    // localStorage indisponível: cai no fallback
  }
  return memoryStatus ?? 'unset';
}

function setTrackingEnabled(enabled: boolean) {
  if (GA_ID) {
    (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = !enabled;
  }
  window.fbq?.('consent', enabled ? 'grant' : 'revoke');
}

function clearTrackingCookies() {
  const names = document.cookie
    .split(';')
    .map(c => c.split('=')[0].trim())
    .filter(n => /^(_ga|_gid|_gat|_fbp|_fbc)/.test(n));
  const domains = ['', ...trackingCookieDomains(window.location.hostname)];
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}

/** Grava a escolha, aplica na hora (liga/desliga e limpa cookies) e avisa os ouvintes. */
export function setConsent(analytics: boolean) {
  memoryStatus = analytics ? 'granted' : 'denied';
  try {
    const value: Stored = { v: CONSENT_VERSION, analytics, at: Date.now() };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
  } catch {
    // sem localStorage: só vale em memória
  }
  setTrackingEnabled(analytics);
  if (!analytics) clearTrackingCookies();
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener('storage', onChange); // outra aba mudou a escolha
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Status atual, reativo. No servidor (e na hidratação) é sempre 'unset'. */
export function useCookieConsent(): ConsentStatus {
  return useSyncExternalStore(subscribe, readConsent, () => 'unset');
}
