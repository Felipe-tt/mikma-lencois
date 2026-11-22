import { emailCallout, emailCta, emailLayout, emailParagraph, emailSection, emailSignature } from '@/lib/email/layout';
import { escapeHtml } from '@/lib/html';

export interface LoginChallengeInfo {
  /** Página de "Sim, fui eu": ela pede o clique (abrir o link não confirma nada). */
  confirmUrl: string;
  /** Página de "Não fui eu": bloqueia a tentativa e leva a criar senha nova. */
  denyUrl: string;
  when: Date;
  device: string;
  place: string | null;
  ip: string;
  /** A senha usada já apareceu em vazamento público. */
  leaked: boolean;
}

/**
 * E-mail de confirmação de login. Quem pediu acertou a senha, então ele diz
 * quando, de onde e de qual aparelho foi, e o que fazer se não foi a dona
 * da conta: não confirmar e trocar a senha (ignorar não basta, a senha já
 * está com outra pessoa).
 */
export function loginChallengeEmail(a: LoginChallengeInfo): { subject: string; html: string; text: string } {
  const when = `${a.when.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })} (horário de Brasília)`;
  const where = a.place ? `${a.place} (IP ${a.ip})` : `IP ${a.ip}`;
  const why = a.leaked
    ? 'A senha usada já apareceu em vazamentos de dados de outros sites, por isso pedimos esta confirmação.'
    : 'Algo nesse acesso fugiu do normal, por isso pedimos esta confirmação.';
  const small = (html: string) => `<p style="margin:0 0 14px;font-size:12px;color:#705A48;line-height:1.6;">${html}</p>`;

  const html = emailLayout(`
    ${emailSection({
      eyebrow: 'Segurança da conta',
      title: 'Foi você que tentou entrar?',
      html: [
        emailParagraph(`Alguém digitou a senha certa da sua conta na <strong>Mikma Lençóis</strong>. ${why}`),
        emailParagraph(`<strong>Quando:</strong> ${escapeHtml(when)}<br><strong>Aparelho:</strong> ${escapeHtml(a.device)}<br><strong>De onde:</strong> ${escapeHtml(where)}`),
        emailCta('Sim, fui eu', a.confirmUrl),
        small('Vale por 10 minutos. Depois de confirmar, a tela onde você digitou a senha continua sozinha.'),
        emailCallout(`<p style="margin:0 0 4px;font-size:14px;color:#2C1F14;line-height:1.6;"><strong>Não foi você?</strong> Quem tentou entrar sabe a sua senha. Não confirme: bloqueie a tentativa e crie uma senha nova.</p>${emailCta('Não fui eu', a.denyUrl, { secondary: true })}`),
        a.leaked ? small('Foi você? Depois de entrar, troque a senha por uma que você não use em nenhum outro site.') : '',
      ].join(''),
    })}
    ${emailSignature()}`, {
    replyHint: false,
    footerNote: 'Este é um e-mail automático de segurança da sua conta.',
    preheader: 'Alguém digitou a senha certa da sua conta. Confirme se foi você.',
  });

  const text = [
    'Foi você que tentou entrar?',
    '',
    `Alguém digitou a senha certa da sua conta na Mikma Lençóis. ${why}`,
    '',
    `Quando: ${when}`,
    `Aparelho: ${a.device}`,
    `De onde: ${where}`,
    '',
    `Foi você? Confirme aqui (vale por 10 minutos): ${a.confirmUrl}`,
    '',
    `Não foi você? Quem tentou entrar sabe a sua senha. Não confirme. Bloqueie a tentativa e crie uma senha nova aqui: ${a.denyUrl}`,
    ...(a.leaked ? ['', 'Foi você? Depois de entrar, troque a senha por uma que você não use em nenhum outro site.'] : []),
    '',
    'Mikma Lençóis',
  ].join('\n');

  return { subject: 'Foi você? Confirme o login na Mikma Lençóis', html, text };
}
