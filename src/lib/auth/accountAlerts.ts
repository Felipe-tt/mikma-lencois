import * as Sentry from '@sentry/nextjs';
import { sendEmail } from '@/lib/email';
import { accountEmailChangedEmail } from '@/lib/email/accountEmailChangedEmail';
import { rateLimit } from '@/lib/rateLimit';

/**
 * O e-mail da conta foi trocado fora do site e alguém tentou entrar ou
 * pedir senha nova com o e-mail novo (lib/auth/authStamp.ts): avisa o
 * e-mail antigo (no máximo uma vez por hora) e a equipe.
 */
export async function alertEmailChangedOutside(account: { uid: string; email: string }, newEmail: string): Promise<void> {
  Sentry.captureMessage('Conta com o e-mail trocado fora do site: entrada travada', 'warning');
  if (!account.email || !await rateLimit(`account-email-changed:${account.uid}`, 1, 60 * 60 * 1000)) return;
  const mail = accountEmailChangedEmail({ newEmail, when: new Date() });
  await sendEmail({ to: account.email, subject: mail.subject, text: mail.text, html: mail.html, from: 'contato' })
    .catch(err => console.error('[conta] aviso de e-mail trocado falhou', err));
}
