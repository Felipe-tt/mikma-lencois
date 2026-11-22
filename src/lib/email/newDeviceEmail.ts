import { emailCallout, emailCta, emailLayout, emailParagraph, emailSection, emailSignature } from '@/lib/email/layout';
import { escapeHtml } from '@/lib/html';

export interface NewDeviceInfo {
  /** E-mail da conta. */
  email: string;
  when: Date;
  device: string;
  /** Cidade e país, só de header provado da Cloudflare (lib/requestPlace.ts). */
  place: string | null;
  ip: string;
  via: 'password' | 'google';
  /** Página do "Não foi você?": criar senha nova (senha) ou Minha conta (Google). */
  actionUrl: string;
}

/**
 * Aviso de acesso à conta por um aparelho novo (lib/userDevices.ts). Diz
 * quando, de onde, por qual aparelho e como foi, e o que fazer se não foi a
 * dona da conta. Quem entrou com a senha sabe a senha: o remédio é criar
 * uma nova, que tira todos os aparelhos da conta. Pelo Google, a senha é a
 * do Google, e o que dá para fazer aqui é sair de todos os aparelhos.
 */
export function newDeviceEmail(a: NewDeviceInfo): { subject: string; html: string; text: string } {
  const when = `${a.when.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })} (horário de Brasília)`;
  const where = a.place ? `${a.place} (IP ${a.ip})` : `IP ${a.ip}`;
  const how = a.via === 'google' ? 'pelo Google' : 'com e-mail e senha';
  const notYou = a.via === 'google'
    ? 'Quem entrou tem acesso à sua conta Google. Troque a senha do Google e, aqui, use "Sair de todos os aparelhos" em Minha conta.'
    : 'Quem entrou sabe a sua senha. Crie uma senha nova agora: com ela, todos os aparelhos saem da sua conta.';
  const cta = a.via === 'google' ? 'Abrir minha conta' : 'Criar senha nova';

  const html = emailLayout(`
    ${emailSection({
      eyebrow: 'Segurança da conta',
      title: 'Novo acesso à sua conta',
      html: [
        emailParagraph(`A sua conta <strong>${escapeHtml(a.email)}</strong> na <strong>Mikma Lençóis</strong> foi aberta num aparelho que ainda não conhecíamos.`),
        emailParagraph(`<strong>Quando:</strong> ${escapeHtml(when)}<br><strong>Aparelho:</strong> ${escapeHtml(a.device)}<br><strong>De onde:</strong> ${escapeHtml(where)}<br><strong>Como:</strong> ${how}`),
        emailParagraph('Foi você? Não precisa fazer nada.'),
        emailCallout(`<p style="margin:0 0 4px;font-size:14px;color:#2C1F14;line-height:1.6;"><strong>Não foi você?</strong> ${escapeHtml(notYou)}</p>${emailCta(cta, a.actionUrl, { secondary: true })}`),
      ].join(''),
    })}
    ${emailSignature()}`, {
    replyHint: false,
    footerNote: 'Este é um e-mail automático de segurança da sua conta.',
    preheader: 'Sua conta foi aberta num aparelho novo. Se foi você, não precisa fazer nada.',
  });

  const text = [
    'Novo acesso à sua conta',
    '',
    `A sua conta ${a.email} na Mikma Lençóis foi aberta num aparelho que ainda não conhecíamos.`,
    '',
    `Quando: ${when}`,
    `Aparelho: ${a.device}`,
    `De onde: ${where}`,
    `Como: ${how}`,
    '',
    'Foi você? Não precisa fazer nada.',
    '',
    `Não foi você? ${notYou} ${a.actionUrl}`,
    '',
    'Mikma Lençóis',
  ].join('\n');

  return { subject: 'Novo acesso à sua conta da Mikma Lençóis', html, text };
}
