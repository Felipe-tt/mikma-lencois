import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import app from '@/lib/firebase/client'

/**
 * App Check: cada pedido do navegador ao Firestore e ao Storage leva uma
 * prova (reCAPTCHA v3, grátis) de que veio do site, não de um script que
 * copiou a chave pública do Firebase. Só é chamado por db.ts e storage.ts,
 * então as páginas que não usam o banco não baixam nada a mais.
 *
 * Ligado por NEXT_PUBLIC_APP_CHECK=1 (apphosting.yaml) depois de registrar
 * a chave do reCAPTCHA no console do Firebase (App Check > Apps). Até
 * alguém clicar em "Aplicar" lá, o Firebase só mede: nada é bloqueado.
 */
let started = false

export function ensureAppCheck(): void {
  if (started || typeof window === 'undefined') return
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
  if (process.env.NEXT_PUBLIC_APP_CHECK !== '1' || !siteKey) return
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === '1') return
  started = true
  try {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true })
  } catch {
    // Já iniciado (hot-reload em dev).
  }
}
