/**
 * Confere e-mail e senha no Firebase Auth pelo servidor, na mesma API que o
 * navegador usa para entrar (só a chave pública, sem permissão especial).
 * Nos testes vai ao emulador do Auth.
 *
 * - 'ok': senha certa;
 * - 'wrong': e-mail ou senha errados;
 * - 'unavailable': não deu para conferir agora (rede, limite do Firebase,
 *   conta desativada). Quem chama decide o que fazer.
 */
export type PasswordCheck = 'ok' | 'wrong' | 'unavailable';

const WRONG = new Set(['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'INVALID_EMAIL', 'MISSING_PASSWORD']);

export async function checkPasswordServerSide(email: string, password: string): Promise<PasswordCheck> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) return 'unavailable';
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const base = emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  try {
    const res = await fetch(`${base}/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return 'ok';
    const body = await res.json().catch(() => null) as { error?: { message?: unknown } } | null;
    // "TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account..." vem com texto depois do código.
    const code = String(body?.error?.message ?? '').split(/[\s:]/)[0];
    return WRONG.has(code) ? 'wrong' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
