'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  cancelPasskey,
  passkeyAutofillSupported,
  passkeyCancelled,
  passkeySupported,
  signInWithPasskey,
} from '@/lib/auth/passkeyClient';

const noopSubscribe = () => () => {};

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  return msg && !/^(Firebase|auth\/)/i.test(msg) ? msg : 'Não foi possível entrar com a passkey. Tente de novo.';
}

/**
 * Passkey no preenchimento automático: com a tela aberta, o campo de e-mail
 * (autocomplete "... webauthn") oferece as passkeys do aparelho. Escolher
 * uma já entra, sem senha.
 */
export function usePasskeyAutofill(onError: (msg: string) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    passkeyAutofillSupported().then(ok => {
      if (!ok || !alive) return;
      signInWithPasskey({ autofill: true }).catch(err => {
        if (alive && !passkeyCancelled(err)) onError(errorText(err));
      });
    });
    return () => { alive = false; cancelPasskey(); };
  }, [enabled, onError]);
}

/** Botão "Entrar com passkey" (só aparece em navegador que suporta). */
export function PasskeySignInButton({ onError }: { onError: (msg: string) => void }) {
  const supported = useSyncExternalStore(noopSubscribe, passkeySupported, () => false);
  const [loading, setLoading] = useState(false);
  if (!supported) return null;

  async function handleClick() {
    setLoading(true);
    onError('');
    try {
      await signInWithPasskey();
    } catch (err) {
      if (!passkeyCancelled(err)) onError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 rounded-full border border-mist bg-paper hover:bg-warm transition-colors py-3 px-4 text-sm font-medium text-ink disabled:opacity-60"
    >
      {loading ? (
        <span className="spinner-dark w-5 h-5" />
      ) : (
        <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21v-1a6 6 0 0 1 9.2-5.1" />
          <circle cx="17.5" cy="14.5" r="2.5" />
          <path d="M17.5 17v4.5M17.5 19.5h1.8" />
        </svg>
      )}
      Entrar com passkey
    </button>
  );
}
