import { escapeHtml } from '@/lib/html';
import { emailCallout, emailCta, emailLayout, emailParagraph, emailSection, emailSignature } from '@/lib/email/layout';

interface ActionEmailInput {
  greetingName: string;
  /** Texto explicando o que aconteceu e o que o botão faz */
  introText: string;
  buttonLabel: string;
  actionUrl: string;
  /** Texto de aviso de segurança (ex: "se você não pediu isso...") */
  securityNote: string;
  /** Texto pequeno embaixo, em geral mencionando o tempo de validade */
  expiryNote: string;
}

interface DeliveryStatusEmailInput {
  greetingName: string;
  headline: string;
  bodyText: string;
  buttonLabel: string;
  actionUrl: string;
}

/**
 * E-mail curto de atualização de entrega Uber (saiu para entrega, entregue,
 * etc). Usa o layout único dos e-mails de pedido; o rodapé convida a
 * responder (o envio tem replyTo pro contato da loja).
 */
export function deliveryStatusEmailHtml({
  greetingName,
  headline,
  bodyText,
  buttonLabel,
  actionUrl,
}: DeliveryStatusEmailInput): string {
  return emailLayout(`
    ${emailSection({
      eyebrow: escapeHtml(headline),
      title: `Olá, ${escapeHtml(greetingName)}!`,
      html: `
        ${emailParagraph(bodyText)}
        ${emailCta(buttonLabel, actionUrl)}`,
    })}
    ${emailSignature()}`);
}

/**
 * E-mail com botão de ação central, usado tanto para confirmar e-mail no
 * cadastro quanto para redefinir senha. Em vez de pedir para o usuário
 * digitar um código de 6 dígitos, o botão já leva para a página certa com
 * o token de verificação na URL, sem nenhuma digitação manual.
 *
 * Inclui o link em texto puro como alternativa, para clientes de e-mail
 * que bloqueiam botões/HTML rico (raro, mas existe).
 */
export function actionButtonEmailHtml({
  greetingName,
  introText,
  buttonLabel,
  actionUrl,
  securityNote,
  expiryNote,
}: ActionEmailInput): string {
  return emailLayout(`
    ${emailSection({
      title: `Olá, ${escapeHtml(greetingName)}!`,
      html: `
        ${emailParagraph(introText)}
        ${emailCta(buttonLabel, actionUrl)}
        <p style="margin:0 0 18px;font-size:12px;color:#9C8B7C;">${expiryNote}</p>
        <p style="margin:0 0 6px;font-size:12px;color:#9C8B7C;line-height:1.6;">
          Se o botão não funcionar, copie e cole este link no navegador:<br>
          <a href="${actionUrl}" style="color:#B45A34;word-break:break-all;">${actionUrl}</a>
        </p>
        ${emailCallout(`<p style="margin:0;font-size:13px;color:#705A48;line-height:1.6;">${securityNote}</p>`)}`,
    })}
    ${emailSignature()}`, { replyHint: false, footerNote: 'Este é um e-mail automático de segurança da sua conta.' });
}
