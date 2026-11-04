import { initializeAppCheck, CustomProvider } from 'firebase/app-check'
import app from '@/lib/firebase/client'
import { getRecaptchaToken } from '@/lib/recaptcha-client'

/**
 * App Check: cada pedido do navegador ao Firestore e ao Storage leva uma
 * prova de que veio do site, não de um script que copiou a chave pública
 * do Firebase. Só é chamado por db.ts e storage.ts, então as páginas que
 * não usam o banco não baixam nada a mais.
 *
 * Provedor próprio: o navegador resolve o Cloudflare Turnstile (grátis,
 * quase sempre invisível) e o servidor troca por um token do App Check
 * (src/app/api/app-check/route.ts). O reCAPTCHA v3 do Firebase foi
 * descontinuado e o substituto é pago.
 *
 * Ligado por NEXT_PUBLIC_APP_CHECK=1 (apphosting.yaml). Até rodar o
 * workflow de infra com app_check: aplicar, o Firebase só mede: nada é
 * bloqueado.
 */
let started = false

export function ensureAppCheck(): void {
  if (started || typeof window === 'undefined') return
  if (process.env.NEXT_PUBLIC_APP_CHECK !== '1') return
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === '1') return
  started = true
  const provider = new CustomProvider({
    getToken: async () => {
      const proof = await getRecaptchaToken('app_check')
      const res = await fetch('/api/app-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: proof }),
      })
      if (!res.ok) throw new Error(`App Check: HTTP ${res.status}`)
      const { token, ttlMillis } = (await res.json()) as { token: string; ttlMillis: number }
      return { token, expireTimeMillis: Date.now() + ttlMillis }
    },
  })
  try {
    initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true })
  } catch {
    // Já iniciado (hot-reload em dev).
  }
}
