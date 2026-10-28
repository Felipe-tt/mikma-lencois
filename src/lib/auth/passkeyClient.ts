'use client';
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
} from '@simplewebauthn/browser';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';

/** Navegador com passkey (WebAuthn). */
export const passkeySupported = () => typeof window !== 'undefined' && browserSupportsWebAuthn();
export const passkeyAutofillSupported = () => browserSupportsWebAuthnAutofill();

async function post<T>(url: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível concluir. Tente de novo.');
  return data as T;
}

/** A pessoa fechou a janela do aparelho ou outra passkey começou: não é erro para mostrar. */
export function passkeyCancelled(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === 'NotAllowedError' || name === 'AbortError';
}

/**
 * Entra com passkey. autofill: espera a pessoa escolher a passkey no
 * preenchimento automático do campo de e-mail (sem abrir janela).
 */
export async function signInWithPasskey({ autofill = false } = {}): Promise<void> {
  const { options, challengeId } = await post<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON']; challengeId: string }>(
    '/api/auth/passkey/login', { step: 'options' },
  );
  const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill });
  const { token } = await post<{ token: string }>('/api/auth/passkey/login', { step: 'verify', challengeId, response });
  await signInWithCustomToken(auth, token);
}

/** Cancela uma espera de passkey em andamento (ex.: o autofill ao sair da tela). */
export const cancelPasskey = () => WebAuthnAbortService.cancelCeremony();

export interface PasskeySummary { id: string; name: string; createdAt: string; lastUsedAt: string | null; synced: boolean }

/** Cria uma passkey para a conta logada. */
export async function createPasskey(idToken: string): Promise<PasskeySummary> {
  const { options, challengeId } = await post<{ options: Parameters<typeof startRegistration>[0]['optionsJSON']; challengeId: string }>(
    '/api/auth/passkey/register', { step: 'options' }, idToken,
  );
  const response = await startRegistration({ optionsJSON: options });
  const { passkey } = await post<{ passkey: PasskeySummary }>('/api/auth/passkey/register', { step: 'verify', challengeId, response }, idToken);
  return passkey;
}
