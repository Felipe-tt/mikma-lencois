'use client';
import {
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type UserCredential,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/client';

/**
 * Verificação em duas etapas no login (TOTP do Firebase Auth): quem
 * cadastrou um app autenticador (Google Authenticator, Authy...) em
 * /painel/seguranca recebe auth/multi-factor-auth-required depois da
 * senha. Aqui pedimos o código de 6 dígitos (janela do
 * SecondFactorPromptHost) e terminamos o login.
 */

type AskCode = (factorName: string, retry: boolean) => Promise<string | null>;
let askCode: AskCode | null = null;

/** O SecondFactorPromptHost se registra aqui ao montar. */
export function registerSecondFactorPrompt(fn: AskCode | null) {
  askCode = fn;
}

const code = (e: unknown) => (e as { code?: string } | null)?.code;

/** Roda o login e, se a conta pedir o segundo fator, pede o código. */
export async function withSecondFactor(signIn: () => Promise<UserCredential>): Promise<UserCredential> {
  try {
    return await signIn();
  } catch (err) {
    if (code(err) !== 'auth/multi-factor-auth-required') throw err;
    const resolver = getMultiFactorResolver(auth, err as MultiFactorError);
    const hint = resolver.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!hint || !askCode) throw new Error('Esta conta usa verificação em duas etapas. Entre com a sua passkey.');
    for (let attempt = 0; attempt < 5; attempt++) {
      const typed = await askCode(hint.displayName || 'App autenticador', attempt > 0);
      if (!typed) throw Object.assign(new Error('Login cancelado.'), { code: 'auth/cancelled-popup-request' });
      try {
        return await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, typed));
      } catch (e) {
        if (code(e) !== 'auth/invalid-verification-code') throw e;
      }
    }
    throw new Error('Código incorreto várias vezes. Entre de novo.');
  }
}
