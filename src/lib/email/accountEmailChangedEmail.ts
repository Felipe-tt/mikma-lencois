import { CONTACT_EMAIL, emailLayout, emailParagraph, emailSection, emailSignature } from '@/lib/email/layout';
import { escapeHtml } from '@/lib/html';

/** "in***@gmail.com": a dona da conta reconhece sem o e-mail inteiro ir parar no aviso. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Aviso no e-mail antigo: o e-mail da conta foi trocado fora do site
 * (lib/auth/authStamp.ts). A conta fica travada até a loja conferir: com o
 * e-mail novo ninguém entra nem recebe link de senha nova.
 */
export function accountEmailChangedEmail(a: { newEmail: string; when: Date }): { subject: string; html: string; text: string } {
  const when = `${a.when.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })} (horário de Brasília)`;
  const masked = maskEmail(a.newEmail);
  const html = emailLayout(`
    ${emailSection({
      eyebrow: 'Segurança da conta',
      title: 'O e-mail da sua conta foi trocado',
      html: [
        emailParagraph(`O e-mail da sua conta na <strong>Mikma Lençóis</strong> foi trocado para <strong>${escapeHtml(masked)}</strong> fora do site, e em ${escapeHtml(when)} alguém tentou entrar com ele.`),
        emailParagraph('Por segurança, travamos a conta: com o e-mail novo ninguém entra nem recebe link de senha nova.'),
        emailParagraph(`<strong>Não foi você?</strong> Responda este e-mail ou escreva para ${escapeHtml(CONTACT_EMAIL)}: devolvemos a conta para você. Se foi você, fale com a gente também, para liberar.`, { muted: true }),
      ].join(''),
    })}
    ${emailSignature()}`, {
    replyHint: false,
    footerNote: 'Este é um e-mail automático de segurança da sua conta.',
    preheader: `O e-mail da sua conta foi trocado para ${masked} fora do site.`,
  });
  const text = [
    'O e-mail da sua conta foi trocado',
    '',
    `O e-mail da sua conta na Mikma Lençóis foi trocado para ${masked} fora do site, e em ${when} alguém tentou entrar com ele.`,
    'Por segurança, travamos a conta: com o e-mail novo ninguém entra nem recebe link de senha nova.',
    '',
    `Não foi você? Responda este e-mail ou escreva para ${CONTACT_EMAIL}: devolvemos a conta para você. Se foi você, fale com a gente também, para liberar.`,
    '',
    'Mikma Lençóis',
  ].join('\n');
  return { subject: 'O e-mail da sua conta na Mikma foi trocado', html, text };
}
